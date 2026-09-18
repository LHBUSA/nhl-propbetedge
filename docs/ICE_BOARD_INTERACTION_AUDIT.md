# Ice Board interaction audit

Every control listed here was **clicked in a real browser**. Nothing is called
working because it has an `href`. Each row records what the click actually did:
the hash before and after, whether the destination mounted real content, and
whether the click produced a console or page error.

**Harness:** `tests/e2e/board-interactions.mjs` (+ `tests/e2e/lib/interaction.mjs`)
Chromium 1187 driven by playwright 1.55.0, headless, 1440×1000 unless stated.

```bash
# local build — every gateway + newsroom call is relayed Node-side with the
# product Origin, exactly like tests/e2e/live-acceptance.mjs, because
# production CORS rejects localhost
npm run build && npm run preview          # 127.0.0.1:4173
node tests/e2e/board-interactions.mjs

# real production — no relay needed, the page is already on the allowed origin
node tests/e2e/board-interactions.mjs --base https://nhl.propbetedge.ai --no-relay
```

Flags: `--quick` (named checks only, skip the responsive sweep), `--widths`,
`--label`, `--json`, `--out`. Screenshots land in `artifacts/board-interactions/`.

---

## Summary

| | BEFORE (production) | AFTER (rebuilt board, local) |
|---|---|---|
| Captured | 2026-09-18T15:12:45Z | 2026-09-18T15:32:33Z |
| Controls discovered @1440 | 86 | 125 |
| Clickable-looking non-controls (dead UI) | 0 | 0 |
| Named checks | PASS 81 · FAIL 3 · MISSING 3 | **PASS 89 · FAIL 0 · MISSING 0** (exit 0) |
| Pinned QA fixtures in navigation | 2 | 0 |
| Controls that navigate but cannot deliver | 3 | 0 (now explicitly disabled) |
| Controls that look actionable and do nothing | 3 (filter chips, zero-game date) | 0 |

The six substantive BEFORE defects — 2 stale targets, 3 licensing-blocked cards
presented as live links, and 3 filter chips that changed nothing on a zero-game
date — are all closed in the rebuild, each re-verified by a real click.

---

## Classification key

| Class | Means |
|---|---|
| **WORKING** | Click produced the intended result and the destination mounted real content, no errors. |
| **WRONG TARGET** | Click navigates, but to a page that cannot answer what the control promised. |
| **STALE TARGET** | Click navigates to a pinned historical fixture rather than a live product destination. |
| **NO REAL ACTION** | Looks actionable, click changes nothing a user can see. |
| **DISABLED BY DATA** | The capability is genuinely unavailable (no licensed source), but the control is still presented as enabled. |
| **BROKEN** | Errors, fails to mount, or lands on the router 404. |

---

## BEFORE — production `https://nhl.propbetedge.ai`

**Captured 2026-09-18T15:12:45Z** (`artifacts/board-interactions/production-before.json`).
League state on the day: zero NHL games on 2026-09-18; preseason opens
2026-09-19 with 7 games. 86 interactive controls discovered at 1440px; **0**
elements with `cursor:pointer` that were not real controls.

Harness totals for this run: **PASS 81 · FAIL 3 · MISSING 3**. The three
MISSING rows are checks written against the rebuilt board that production does
not have yet (`Slate nav · Tomorrow`, `Filters · zero-game quiet state`,
`Filters · quiet disclosure opens`) — they are reported MISSING rather than
skipped, which is the point of the gate.

### Counts

| Class | Count |
|---|---|
| WORKING | 53 |
| STALE TARGET | 2 |
| DISABLED BY DATA | 3 |
| NO REAL ACTION | 3 |
| WRONG TARGET | 0 |
| BROKEN | 0 |
| Status text, correctly non-interactive | 1 |

### Chrome

| Control | Before → after | Mounted | Errors | Class |
|---|---|---|---|---|
| Skip to content | focus → `#main` | — | 0 | WORKING |
| Logo / brand | `#/` → `#/` | yes | 0 | WORKING |
| Ice Board | stays `#/`, `aria-current=page` | yes | 0 | WORKING |
| PBE Picks | `#/` → `#/pbe-picks` | yes | 0 | WORKING |
| PBE Cast | `#/` → `#/cast/2026010001` | yes | 0 | WORKING |
| Props | `#/` → `#/props` | yes | 0 | WORKING |
| Shot Lab | `#/` → `#/shots` | yes | 0 | WORKING |
| Shot Lab — entry id source | href `#/shots` carries no id; the page renders its own slate entry state | yes | 0 | WORKING |
| PBE Cast — entry id source | href `#/cast` carries no id; the page resolved `2026010001` from the live schedule | yes | 0 | WORKING |
| More — opens | menu becomes visible | — | 0 | WORKING |
| More — second click closes | menu hidden | — | 0 | WORKING |
| More — outside click closes | menu hidden | — | 0 | WORKING |
| More — Escape closes | menu hidden | — | 0 | WORKING |
| More — closes after navigation | menu hidden on destination | — | 0 | WORKING |
| More › News | `#/` → `#/news` | yes | 0 | WORKING |
| More › Goalies | `#/` → `#/goalies` | yes | 0 | WORKING |
| More › Lines | `#/` → `#/lines?team=DAL` | yes | 0 | WORKING |
| More › Injuries | `#/` → `#/injuries` | yes | 0 | WORKING |
| More › Matchups | `#/` → `#/matchup` | yes | 0 | WORKING |
| More › Players | `#/` → `#/players` | yes | 0 | WORKING |
| More › Standings | `#/` → `#/standings` | yes | 0 | WORKING |
| More › Track Record | `#/` → `#/track-record` | yes | 0 | WORKING |
| More › Methodology | `#/` → `#/methodology` | yes | 0 | WORKING |
| NHL Pro | opens the Founding Season dialog; Escape closes it | — | 0 | WORKING¹ |
| Season / preseason chip | `<span>`, no handler, `cursor:default` — text "PRESEASON IN 1 DAY" | — | 0 | status text (correctly non-interactive) |
| Alerts bell | opens the alert panel; Close closes it | — | 0 | WORKING |
| Search — click | palette opens, input focused | — | 0 | WORKING |
| Search — Ctrl-K | palette opens | — | 0 | WORKING |
| Search — Escape | palette closes | — | 0 | WORKING |
| Search — type a team | "Edmonton" → TEAM result → `#/team/EDM` | yes | 0 | WORKING |
| Search — page result | "Standings" → PAGE result → `#/standings` | yes | 0 | WORKING |
| Search — Enter on highlighted | highlighted `#/methodology` selected | yes | 0 | WORKING |
| Mode ribbon "What's available" | `#/news` → `#/?mode=1`, scrolls to the capability panel | yes | 0 | WORKING |

¹ The dialog opens and closes correctly. Note separately that `pro.js` ships
`OPEN_FOR_PURCHASE = false`, so the surface behind it is informational — that is
a billing decision, not an interaction defect.

### Hero and "What changed"

| Control | Before → after | Mounted | Errors | Class |
|---|---|---|---|---|
| "Open the Ice Board" | in-page jump, scrolled to y=1099, hash unchanged | yes | 0 | WORKING |
| "PBE Cast" | `#/` → `#/cast/2026010001` | yes | 0 | WORKING |
| "How we source" | `#/` → `#/methodology` | yes | 0 | WORKING |
| Next puck drop — DAL @ STL | `#/` → `#/cast/2026010001` | yes | 0 | WORKING |
| Next puck drop — MTL @ TOR | `#/` → `#/cast/2026010006` | yes | 0 | WORKING |
| Next puck drop — TOR @ MTL | `#/` → `#/cast/2026010007` | yes | 0 | WORKING |
| "Newsroom →" | `#/` → `#/news` | yes | 0 | WORKING |
| What Changed story links | 5 sampled and fetched Node-side: all < 400, all `target=_blank rel=noopener` | n/a | 0 | WORKING |

### Board

| Control | Before → after | Mounted | Errors | Class |
|---|---|---|---|---|
| Previous day `‹` | `#/` → `#/?date=2026-09-17` | yes | 0 | WORKING |
| Today | returns the board to 2026-09-18, URL back to `#/` | yes | 0 | WORKING |
| Next day `›` | `#/` → `#/?date=2026-09-19` | yes | 0 | WORKING |
| Date input | set 2026-09-21 → `#/?date=2026-09-21` | yes | 0 | WORKING |
| Filter **All** | `aria-pressed=true`; board body unchanged | yes | 0 | WORKING (no-op today) |
| Filter **Live** | `aria-pressed=true`, board body **byte-identical** | yes | 0 | **NO REAL ACTION** |
| Filter **Upcoming** | `aria-pressed=true`, board body **byte-identical** | yes | 0 | **NO REAL ACTION** |
| Filter **Final** | `aria-pressed=true`, board body **byte-identical** | yes | 0 | **NO REAL ACTION** |
| "View the Sat, Sep 19 slate" | `#/` → `#/?date=2026-09-19`, 7 cards | yes | 0 | WORKING |
| Game card → PBE Cast (on 09-19) | `#/?date=2026-09-19` → `#/cast/2026010001` | yes | 0 | WORKING |
| Game card → Matchup (on 09-19) | → `#/matchup/2026010001` | yes | 0 | WORKING |
| Game card → Goalies (on 09-19) | → `#/goalies/2026010001` | yes | 0 | WORKING |

**Evidence for the three NO REAL ACTION rows.** `src/pages/board.js` at the
deployed SHA branches on `!games.length` *before* it branches on the selected
filter, so on a zero-game date the rendered body is identical for every filter
value. On 2026-09-18 that means four chips each reading `0`, three of which
change nothing whatsoever when clicked — only `aria-pressed` moves. The chips
do filter correctly on a date that has games (verified on 2026-09-19), so this
is a zero-game-state defect, not a broken control.

### Preseason Intelligence panel (capability cards)

| Card | Column | `href` | What actually loads | Class |
|---|---|---|---|---|
| Historical replay | Available now | `#/cast?view=all&date=2026-04-16` | The **Thursday, April 16** slate — the last day of the 2025-26 season. A pinned demo date; `#/cast` on its own already resolves the current game. | **STALE TARGET** |
| Shot intelligence | Available now | `#/shots/2025020500` | **MTL 4 – NYR 5, Sat Dec 13 2025, Madison Square Garden, "GAME 2025020500", "2025-26 REGULAR SEASON"** — a QA fixture. `#/shots` on its own shows the current slate and a date picker. | **STALE TARGET** |
| Line deployment | Available now | `#/lines` → `#/lines?team=DAL` | Official roster + last-game deployment. | WORKING |
| Team & player research | Available now | `#/players` | League leaders, rosters. | WORKING |
| Standings & history | Available now | `#/standings` | 2025-26 final table, labelled. | WORKING |
| Newsroom | Available now | `#/news` | NHL newsroom. | WORKING |
| Market snapshots | Available now | `#/props` | Props board + Best Line. | WORKING |
| Source health | Available now | `#/methodology` | Methodology page. | WORKING |
| Live PBE Cast | Awaiting | `#/cast` | Cast command centre. | WORKING |
| Confirmed starting goalies | Awaiting | `#/goalies` | Starter board, 0 of 14 confirmed — honest. | WORKING |
| Player prop markets | Awaiting | `#/props` | Props board; "MARKETS NOT POSTED IN THE SNAPSHOT". Same destination as *Market snapshots*. | WORKING (duplicate destination) |
| Projected starting goalies | Licensing-dependent | `#/goalies` | The destination states: *"no licensed pregame source is integrated and we do not project starters."* Rendered as an ordinary enabled `<a href>`, with no `aria-disabled`, and identical to the *Confirmed starting goalies* link. | **DISABLED BY DATA** |
| Injury status table | Licensing-dependent | `#/injuries` | The destination states: *"BLOCKED — Structured status table … An OUT / day-to-day / IR table needs a licensed injury feed."* Rendered as an enabled `<a href>`. | **DISABLED BY DATA** |
| Projected lines & PP units | Licensing-dependent | `#/lines` | The destination states: *"Projected lines & PP units — BLOCKED. Only restricted sources publish them; licensing required."* Rendered as an enabled `<a href>`, identical to the *Line deployment* link. | **DISABLED BY DATA** |

All three licensing-dependent cards navigate, so they are not dead — but each
advertises a capability the destination explicitly refuses to provide, while
looking exactly like the cards that do deliver. That is the pattern the rebuild
replaces with non-anchor `aria-disabled` cards.

### Footer, mobile and responsive

| Control | Result | Class |
|---|---|---|
| Footer product links (Ice Board, PBE Cast, Props, Goalies, Lines, Injuries, Shot Lab, Standings) | all clicked, all mounted | WORKING |
| Footer trust links (Methodology, Track record, Image credits) | all clicked, all mounted | WORKING |
| Footer + sheet network links (PBE hub, MLB/NFL/NBA/WNBA/NHL/UFC, News, Learn, Store, Stripe billing, Discord, mailto) | cross-origin — not clicked; recorded as external targets only | not exercised |
| Mobile bottom nav (Board, PBE Picks, Cast, Props) @390 | 4/4 destinations mounted | WORKING |
| Mobile More sheet | opens, 14 items, first navigates and the sheet closes | WORKING |
| Responsive 1440 / 1280 / 1024 / 768 / 430 / 390 / 360 | horizontal overflow 0px, console errors 0, page errors 0, every rendered image `naturalWidth > 1`, no control outside the viewport at any width | WORKING |

**Generic sweep:** 35 unique internal destinations clicked from the Ice Board;
every one mounted real content, none hit the router 404, zero console or page
errors across the whole sweep.

---

## AFTER — local build of the rebuilt board

Run against `npm run build` + `npm run preview` on `127.0.0.1:4173`, with every
gateway and newsroom call relayed Node-side under the product Origin. Same
league day, same real data. Captured **2026-09-18T15:32:33Z**.
**125 interactive controls discovered at 1440px** (up from 86), **0**
clickable-looking elements that are not controls.

**Result: PASS 89 · FAIL 0 · MISSING 0 — the gate exits 0.**
(`artifacts/board-interactions/local-redesign.json`)

### Every BEFORE defect, re-tested

| BEFORE defect | AFTER | Evidence from the clicked run |
|---|---|---|
| Historical replay → pinned `date=2026-04-16` | fixed | `#/` → `#/cast/2026010001`, mounted. The link is now `#/cast` and the page resolves the current game itself. |
| Shot intelligence → pinned `#/shots/2025020500` | fixed | `#/` → `#/shots/2025030416`, mounted. The link is `#/shots` with **no id**; the id is resolved at runtime from the live schedule (`src/lib/recent-games.js`), which the gate asserts separately. |
| Projected starting goalies — enabled link to a page that cannot project | fixed | Now a non-anchor `aria-disabled="true"` card: *"No licensed projection feed is connected, so nothing is projected."* |
| Injury status table — enabled link to a blocked table | fixed | Non-anchor `aria-disabled="true"`: *"No licensed injury feed is connected. Newsroom reports are not a status table."* |
| Projected lines & PP units — enabled link, same href as Line deployment | fixed | Non-anchor `aria-disabled="true"`: *"No licensed line feed is connected. Official rosters are in Line deployment."* |
| Live/Upcoming/Final chips: four zero pills, three doing nothing on a zero-game date | fixed | Zero-game date now renders `data-filters="quiet"` with the chips collapsed behind a disclosure; the disclosure opens on a real click and reveals 4 working chips. On a date with games the chips filter for real: All `7 → 7`, Live `7 → 0`, Upcoming `0 → 7`, Final `7 → 0` cards, each with `aria-pressed=true`. |
| No way to reach tomorrow's slate in one click | fixed | `Slate nav · Tomorrow` → `#/?date=2026-09-19`, mounted. `Today` is marked current and keeps the board mounted; `Next slate` is correctly not drawn because the next slate *is* tomorrow. |

### New controls in the rebuild, all clicked

| Control | Result |
|---|---|
| Slate nav · Today / Tomorrow / Next slate | PASS (see above) |
| Filters · quiet state + disclosure | PASS |
| Quick Launch · capability detail disclosure | PASS — closed → open, 15 capability cards revealed |
| Quick Launch · PBE Picks desk → `#/pbe-picks` | PASS |
| Hero CTA · View tomorrow's slate / PBE Picks / PBE Cast | PASS |
| Game card → Matchup / PBE Picks / PBE Cast (7 cards on 2026-09-19) | PASS, all three destinations mount |
| Shot Lab + PBE Cast entry-id provenance | PASS — hrefs carry no id; ids come from the schedule |

### Sweep, dead UI, fixtures, responsive

| Check | Result |
|---|---|
| Generic sweep | 56 unique internal destinations clicked (was 35); all mounted, none hit the router 404, zero errors |
| NO DEAD UI | PASS — every clickable-looking element acts or is explicitly `aria-disabled` and not an `<a href>` |
| NO HARD-CODED QA FIXTURES | PASS — no pinned id or past date in any control href, and no such literal anywhere in `src/**` |
| Responsive 1440 / 1280 / 1024 / 768 / 430 / 390 / 360 | PASS — overflow 0, console errors 0, page errors 0, every rendered image loaded (24 at 390px), no unreachable control |
| Mobile bottom nav + More sheet @390 | PASS |

**One harness correction made during this run, recorded for honesty.** The
first AFTER run reported FAIL at 430/390/360 for three Quick Launch cards
"outside the viewport". Inspection showed they sit inside `.ql`, a deliberate
horizontal card rail (`overflow-x:auto`, `scrollWidth 2203 > clientWidth 358`)
with page-level overflow still 0 — reachable by swiping. The reachability rule
now treats a control as unreachable only when **no** ancestor can scroll
sideways to bring it into view. That was a false positive in the gate, not a
defect in the board.

---

## What the gate enforces

1. **Discovery, not selectors.** Controls are enumerated from the rendered DOM
   (`a[href]`, `button`, `[role=button]`, inputs, `summary`, focusables) plus a
   second sweep for anything with `cursor:pointer` that is *not* a control. No
   product class name is a contract, so renaming `.mode-panel` cannot turn a
   real failure into a pass. Elements are re-located by identity (accessible
   name + `href` + data hooks) immediately before each click, because the board
   re-renders on every poll and a stale `nth-child` path would silently click
   the wrong control.
2. **Behaviour, not markup.** A control passes only when the location changed
   as intended **and** `#main` really mounted (element children, real text, not
   a skeleton, not the router's "That page does not exist") **and** the click
   produced zero page errors and zero console errors.
3. **NO DEAD UI.** Anything clickable-looking must navigate, open a panel, or
   change page state — or be explicitly marked unavailable (`aria-disabled="true"`
   or `[data-state="unavailable"]`) **and** not be an `<a href>`. Buttons with no
   delegated data hook are clicked and must still produce a state change.
4. **NO HARD-CODED QA FIXTURES.** Fails if any control's `href` carries a game
   id from a previous season or a `date=` parameter in the past, and (for local
   runs) if any such literal appears in a navigation string in `src/**`.
   Historical ids are legal only inside `tests/`. A route that *resolves* a
   historical game from the live schedule at runtime is explicitly allowed and
   separately asserted — the id must come from the schedule, never from the link.
5. **Named checks, honest gaps.** Every control the owner listed has its own
   named check that performs a real click. A named control that does not exist
   is reported **MISSING**, never PASS, so the gate cannot be made green by
   deleting a control. Absences that are a deliberate product decision are
   proved rather than assumed — the NHL Pro control, for example, is only
   accepted as correctly withheld when the gateway's own `/readiness` reports
   `auth.email=false`.
6. **Both slate states.** Filters are exercised on a date that really has games
   (discovered from the page's own jump targets, never a pinned date) so
   "did it filter?" is a real question; the zero-game date is separately checked
   for the quiet/collapsed presentation and for the chips still working once the
   disclosure is opened.
7. **Responsive.** 1440, 1280, 1024, 768, 430, 390, 360: horizontal overflow
   must be 0, console errors 0, page errors 0, every rendered `img` must have
   `naturalWidth > 1`, and no control may sit outside the viewport. Screenshots
   are written to `artifacts/board-interactions/`.
8. **Report + exit code.** One line per control, `NAME — PASS|FAIL|MISSING`,
   totals, and a non-zero exit on any FAIL or MISSING.
