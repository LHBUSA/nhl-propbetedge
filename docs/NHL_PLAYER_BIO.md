# NHL player biography layer — `nhl-player-bio/1.0.0`

Every canonical player profile renders **About [Player]**, **Career at a glance**
and a **Career journey** from one structured fact packet. There is no
hard-coded player, no generative step and no fame score. A long, decorated
career produces a long biography because its packet holds more verified facts.

## Payload audit (NHL `player/{id}/landing`, 2026-10-02)

| Upstream field | Present | Before | Now (`/nhl/player/:id`) |
|---|---|---|---|
| `draftDetails` {year, teamAbbrev, round, pickInRound, overallPick} | yes (absent for undrafted players, e.g. Panarin) | dropped | `draft` (null when absent: unknown, never "undrafted") |
| `awards[]` {trophy, seasons[{seasonId, gameTypeId, …stat copy}]} | yes | dropped | `honors[]` {trophy, seasons[{season, game_type}]}; stat copies dropped |
| `badges[]` {title, logoUrl} | yes (e.g. "100 Greatest Players") | dropped | `badges[]` titles |
| `inHHOF` 0/1 | yes | dropped | `in_hhof` true or null (0 is never a negative claim) |
| `inTop100AllTime` 0/1 | yes | dropped | `in_top_100_all_time` true or null |
| `birthStateProvince` | yes | dropped | `birth_state_province` |
| `seasonTotals[]` (all leagues; `sequence` orders clubs inside a season) | yes | passed | unchanged; NHL rows drive span, clubs, journey |
| `careerTotals` regular/playoffs | yes | passed | unchanged |
| first NHL season | derived | — | min NHL season with GP > 0 |
| franchise/team history | derived from season rows (`teamName`, no team id) | — | `teams[]` in first-appearance order |
| captaincy / leadership | **not present** | — | not shown |
| transaction dates | **not present** | — | never inferred; traded seasons list clubs in source `sequence` with per-club GP |

Backend: `propsports-api-worker` `nhl-intelligence/src/nhl-data.js` `playerProfile()`
(commit e1bac1e, regression in `test/nhl-intelligence-regression.mjs`). The gateway
passes `/nhl/player/:id` through unchanged; the browser never calls NHL directly.

## Fact packet (`src/lib/player-bio.js` `buildBioFacts`)

```
{ schema, player_id, stats_through,
  identity { name, last_name, position, position_text, goalie, active, current_team, birth_* },
  draft { year, team_abbrev, team_name, round, pick_in_round, overall_pick } | null,
  career { first_season, last_season, regular_seasons, regular, playoffs, latest_regular, recent_full_regular },
  teams [{ name, abbrev, first_season, last_season, seasons }],
  journey [{ season, clubs [{ name, abbrev, gp }], gp, goals, points, wins }],
  honors [{ trophy, seasons }], cups [{ season, team }], recognitions [],
  style { season, peer_group, population_n, version, strongest [{key, score}], watch } | null,
  sources [], evidence_hash }
```

`evidence_hash` is FNV-1a over the stable JSON of the packet. It is rendered as
`data-bio-hash`, so a visible biography can be traced back to its evidence. The
prose is a pure function of the packet. Each sentence carries the fact keys it
was built from, and `tests/player-bio.test.mjs` proves that every number in
every sentence is recoverable from the packet.

## Sources and disclosure

- **NHL facts:** identity, draft, career span, clubs, totals, honors and badges.
  Disclosed as `Biography facts: NHL · career statistics through <latest game date>`.
- **Statistical profile:** PropBetEdge analysis, read from the STORED Skater DNA
  traits (strongest 67+ and watch ≤33 bands, frozen 1.0.0). Rendered in a
  separate block labelled `Statistical profile · PropBetEdge analysis` and
  disclosed as `Statistical profile: PropBetEdge analysis of NHL data`. It
  describes a statistical profile only. It makes no personality or causal
  claim, and it never appears for goalies.
- Wikidata is **not** used in 1.0.0.

## Fail-closed rules

- A missing draft is shown as `—` in the rail and omitted from the prose. It is never "undrafted".
- Empty honors produce no honors paragraph. They are never "no awards".
- A Stanley Cup club is named only when exactly one NHL club has playoff games that season.
- The recent-season sentence uses the latest season with 10+ GP. A season in progress is stated as games played only.
- Prose uses the surname, not pronouns.
- The editorial context (`Team context around …` / `Analysis touching …`) now sits below the career history, labelled `Current editorial context`.

## Page hierarchy

Hero → About + Career at a glance → Player DNA → PBE intelligence → current
season line → recent form → game log → career history (totals + journey) →
current editorial context → related headlines → Fight History.
