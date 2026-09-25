import { $, $$, esc, on } from '../lib/dom.js';
import { portraitCredits } from '../components/player.js';

// Methodology: static editorial page. The hash router owns "#", so the table
// of contents uses buttons that scroll, never "#id" links.

const table = (head, rows, cls = '') => `<div class="table-wrap mth-table${cls ? ` ${cls}` : ''}"><table class="pbe-table">
  <thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td data-label="${esc(head[i])}">${c}</td>`)).join('')}</tr>`).join('')}</tbody>
</table></div>`;

const defs = items => `<dl class="mth-defs">${items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
const code = lines => `<pre class="mth-code" tabindex="0"><code>${lines.map(esc).join('\n')}</code></pre>`;
const tag = (text, kind = 'unknown') => `<span class="pbe-badge pbe-badge--${kind}">${esc(text)}</span>`;

const SECTIONS = [
  {
    id: 'truth',
    title: 'Data truth rules',
    lede: 'These rules override visual convenience. Every surface on this site is built to them, and a static check in the build enforces the ones a machine can.',
    body: `<ol class="mth-rules">
      <li><b>Never fabricate a sports fact.</b> If a value is not in a source, it is not on the page.</li>
      <li><b>No randomness.</b> Not in rendering, model inputs, probabilities, shot locations or placeholders.</li>
      <li><b>A missing coordinate stays null.</b> The attempt is counted in every total and never placed at a guessed spot.</li>
      <li><b>A missing starter is UNKNOWN.</b> A goalie is called projected only when a licensed source actually projects him.</li>
      <li><b>A missing line combination is unavailable.</b> It is not inferred from the last game unless it is labeled as historical deployment.</li>
      <li><b>No made-up</b> injuries, return dates, books, prices, line movement or probabilities.</li>
      <li><b>Stale data is never labeled LIVE.</b></li>
      <li><b>Every time-sensitive panel shows its source and age.</b></li>
      <li><b>Source text is untrusted.</b> It is escaped before it reaches the page.</li>
      <li><b>A model claim needs a model version</b> and a reproducible method.</li>
      <li><b>A heuristic is called a heuristic.</b></li>
      <li><b>The NHL has 32 teams.</b> The 2026-27 preseason opens Sep 19, 2026 and the 84-game regular season opens Sep 29, 2026.</li>
      <li><b>Every number carries its season.</b> Until 2026-27 games are played, the NHL's "current" endpoints return 2025-26 data, and we label it that way.</li>
    </ol>`
  },
  {
    id: 'sources',
    title: 'Sources & licensing',
    lede: 'Data reaches your browser through our server, never straight from a provider, and only from sources whose terms we have read. Where terms do not allow a use, the feature waits.',
    body: `${table(['Source', 'What we use', 'Status'], [
      ['NHL public data<br><span class="faint">api-web.nhle.com · stats API</span>', 'Schedule, scores, game state, play-by-play with coordinates, box scores, rosters, season stats, leaders, standings, shift charts', `${tag('Owner risk decision', 'reported')}<span class="mth-cell-note">NHL.com terms limit use to non-commercial, personal use and no commercial license exists for these endpoints. We render facts only: no NHL video, photos, player headshots or article text.</span>`],
      ['Newsroom<br><span class="faint">NHL.com content API · Yahoo Sports NHL RSS</span>', 'Headline, source, time and a link out. Never bodies or summaries.', `${tag('Headlines + links only', 'confirmed')}<span class="mth-cell-note">Yahoo's RSS terms allow unmodified headlines with attribution, so those items say "via Yahoo Sports". NHL.com items fall under the owner risk decision above.</span>`],
      ['Odds and props<br><span class="faint"><a href="https://propsports.proptechusa.ai/" target="_blank" rel="noopener noreferrer">PropSports.PropTechUSA.ai Market Feed</a></span>', 'Market snapshots with capture time, book and age', `${tag('Pending', 'unavailable')}<span class="mth-cell-note">Terms allow display in this product. The snapshot ingest is not running yet, so no price appears anywhere.</span>`],
      ['Pregame goalies, projected lines, injury statuses', '—', `${tag('Blocked by licensing', 'unavailable')}<span class="mth-cell-note">The sites that publish them prohibit scraping or commercial use. A licensed feed is required; until then these read UNKNOWN or unavailable.</span>`],
      ['Player portraits<br><span class="faint">Wikimedia Commons</span>', 'Reviewed, openly licensed photos matched to the player through Wikidata (NHL player id)', `${tag('Credited', 'confirmed')}<span class="mth-cell-note">CC0, public domain, CC BY or CC BY-SA only, each credited below. NHL.com headshots are not used. Everyone else gets initials and a team mark.</span>`]
    ], 'mth-table--stack')}
    ${defs([
      ['OFFICIAL', 'Published by the NHL as league data: scores, box scores, rosters, scratches.'],
      ['REPORTED', 'A third party or editorial desk reports it. It is not a league record.'],
      ['PROJECTED', 'Someone\'s forecast, such as a projected lineup.'],
      ['DERIVED', 'Computed by us from OFFICIAL raw data and labeled with the method.'],
      ['MARKET', 'A sportsbook price, shown as a snapshot with its capture time.']
    ])}`
  },
  {
    id: 'freshness',
    title: 'Freshness states',
    lede: 'Every payload carries fetched_at, ttl_s and stale_after_s. The page derives one of five states from them and re-checks every second, so a label cannot stay CURRENT after refreshes stop.',
    body: `${table(['State', 'Definition'], [
      ['<span class="mth-fresh" data-state="CURRENT"><i></i>CURRENT</span>', 'Fetched within its TTL (age up to 2 × ttl + 5 s).'],
      ['<span class="mth-fresh" data-state="CACHED"><i></i>CACHED</span>', 'Older than 2 × ttl + 5 s but still inside stale_after.'],
      ['<span class="mth-fresh" data-state="STALE"><i></i>STALE</span>', 'Past stale_after, or the latest refresh failed and the screen is showing last-known data.'],
      ['<span class="mth-fresh" data-state="UNAVAILABLE"><i></i>UNAVAILABLE</span>', 'No data, and the source or route is not available.'],
      ['<span class="mth-fresh" data-state="ERROR"><i></i>ERROR</span>', 'No data, and the request failed.']
    ])}
    <p>Last-known data stays on screen when it is safe, marked with its age, rather than disappearing. A <span class="pbe-badge pbe-badge--live">LIVE</span> badge inside a panel whose data has gone stale switches to <b>STALE FEED</b>.</p>`
  },
  {
    id: 'states',
    title: 'Game state vocabulary',
    lede: 'One vocabulary for every game on every page, mapped from the source\'s game state and schedule state. Nothing in between is guessed.',
    body: table(['State', 'Source basis', 'What you see'], [
      ['SCHEDULED', 'gameState FUT', 'Start time in Eastern time'],
      ['PREGAME', 'gameState PRE', 'Pregame, no score'],
      ['LIVE', 'gameState LIVE or CRIT', 'Period and clock'],
      ['INTERMISSION', 'LIVE with the intermission flag', 'Period + INT'],
      ['FINAL', 'gameState FINAL or OFF', 'Final score; /OT or /SO from the last period type'],
      ['POSTPONED', 'schedule state PPD', 'Postponed'],
      ['SUSPENDED', 'schedule state SUSP', 'Suspended'],
      ['CANCELLED', 'schedule state CNCL', 'Cancelled'],
      ['UNAVAILABLE', 'anything else', 'State unavailable']
    ].map(([a, b, c]) => [`<span class="mono">${a}</span>`, `<span class="mono dim">${b}</span>`, c]))
  },
  {
    id: 'geometry',
    title: 'Shot geometry (geometric-v1)',
    lede: 'Distance and angle are engineered features computed from official coordinates. They are measurements, and the danger bucket built on them is a heuristic, not xG.',
    body: `${defs([
      ['Coordinates', 'Feet, centre ice at (0, 0): x from −100 to 100, y from −42.5 to 42.5. Goal lines at x = ±89.'],
      ['Attacking net', 'From the play-level <span class="mono">homeTeamDefendingSide</span> and the shooter\'s team. Never from whichever net is closer, which mislabels every shot from outside the offensive zone. If direction is unknown, distance, angle and danger are null.'],
      ['Distance', 'Straight line from the shot location to the centre of the attacking goal line.'],
      ['Angle', 'Off the centre line of the net: 0° is straight on, 90° is level with the goal line, above 90° is behind the net.'],
      ['Blocked attempts', 'The coordinates are the block location reported by the source, not where the shot was released.']
    ])}
    ${code([
      '// depth < 0 means the shot is behind the net',
      'depth    = netX > 0 ? netX − x : x − netX',
      'lateral  = |y|',
      'distance = √(depth² + lateral²)',
      'angle    = atan2(lateral, depth) × 180 / π'
    ])}
    ${table(['Bucket', 'Rule'], [
      ['<span class="mono">High</span>', 'distance ≤ 25 ft and angle ≤ 45°'],
      ['<span class="mono">Medium</span>', 'distance ≤ 45 ft and angle ≤ 60° (and not high)'],
      ['<span class="mono">Low</span>', 'everything else, including every shot from behind the net']
    ])}
    <p class="mth-callout"><span class="pbe-badge pbe-badge--heuristic">Geometric heuristic · not xG</span> The buckets ignore shot type, rebounds, rushes and game state. They describe where a shot came from, not how likely it was to score.</p>`
  },
  {
    id: 'corsi',
    title: 'Corsi, Fenwick & 5v5',
    lede: 'Attempt counts built from every shot event in the play-by-play.',
    body: `${defs([
      ['Corsi (CF)', 'Every shot attempt: goals, shots on goal, missed shots and blocked shots.'],
      ['Fenwick (FF)', 'Unblocked attempts: Corsi minus blocked shots.'],
      ['Shots on goal', 'Saved shots plus goals.'],
      ['5v5', 'Attempts whose situationCode is exactly 1551: five skaters a side, both goalies in net.'],
      ['Attempt share', 'A team\'s attempts ÷ both teams\' attempts.'],
      ['Shootout', 'Shootout attempts are excluded from every total, map and chart.']
    ])}
    <p><b>Blocked-shot attribution.</b> A blocked attempt belongs to the shooting team, identified from the shooter's spot on the game roster. We never rely on the event-owner field, and never on a blocked shot's zone code, which the source records from the blocker's side.</p>`
  },
  {
    id: 'pressure',
    title: '5-minute pressure',
    lede: 'A descriptive view of who is generating attempts right now.',
    body: `<p>For each team, the number of shot attempts in the trailing 300 seconds of game time, sampled every 30 seconds. Goals are marked as ticks. Shootout attempts are excluded.</p>
    <p class="mth-callout"><span class="pbe-badge pbe-badge--heuristic">Descriptive · not a model</span> Pressure is a count, not a win probability and not a forecast.</p>`
  },
  {
    id: 'manpower',
    title: 'Manpower from situationCode',
    lede: 'The source stamps each event with a four-digit situation code. We read strength from it and nothing else.',
    body: `<div class="mth-sitcode" role="img" aria-label="situationCode 1551: away goalie in net, 5 away skaters, 5 home skaters, home goalie in net">
      ${[['1', 'Away goalie in net', '1 = in, 0 = pulled'], ['5', 'Away skaters', 'on the ice'], ['5', 'Home skaters', 'on the ice'], ['1', 'Home goalie in net', '1 = in, 0 = pulled']]
        .map(([d, k, v]) => `<div><b class="mono">${d}</b><span>${k}</span><small>${v}</small></div>`).join('')}
    </div>
    ${defs([
      ['1551', 'Five-on-five, both goalies in net.'],
      ['1451', 'Away four skaters, home five: home power play.'],
      ['0651', 'Away goalie pulled for a sixth skater: even strength, not a power play.']
    ])}
    <p>Strength compares goalie-adjusted manpower, so an extra attacker for a pulled goalie reads as EV. Because the code is attached to events, the displayed manpower can lag a penalty expiry until the next event is recorded. A malformed code yields no strength rather than a guess.</p>`
  },
  {
    id: 'goalies',
    title: 'Goalie status',
    lede: 'Three truth levels that are never collapsed into one.',
    body: `${table(['Status', 'When it is used'], [
      [tag('Confirmed', 'confirmed'), 'Only from the NHL box score starter flag, at or after puck drop. It marks the goalie who started, even if he was later pulled.'],
      [tag('Projected / Reported', 'reported'), 'From NHL.com’s daily projected-lineups report, linked and timestamped. This is an editorial projection, never an official confirmation.'],
      [tag('Unknown', 'unknown'), 'Used when NHL.com has not published a projection for the matchup, the source check is unavailable, or the box score has not yet confirmed a starter.']
    ])}
    <p>The prior-season goalie comparison in the NHL game centre lists the two goalies with the most games played last season. It is not a starter signal and is never shown as one. A projected starter automatically yields to the NHL box-score starter flag at puck drop.</p>
    <p class="dim">GSAx (goals saved above expected) is not available until a validated xG model is released.</p>`
  },
  {
    id: 'newsroom',
    title: 'Newsroom categorization',
    lede: 'Headlines and links only. We categorize conservatively and show the basis for every label.',
    body: `<ol class="mth-rules">
      <li><b>Source tags first.</b> A source tag such as NHL.com's "injury" or "transactions" decides the category.</li>
      <li><b>Headline keyword rules second.</b> Conservative patterns for injuries, trades, transactions, goalies, lines, previews and recaps. Goalie and lines rules need an availability or deployment verb, so a story that merely mentions a goalie is not a goalie update.</li>
      <li><b>League news otherwise.</b> Each item shows whether its category came from a source tag, a keyword rule or the default.</li>
    </ol>
    ${defs([
      ['Categories', 'Injuries · Trades · Transactions · Goalies · Lines · Previews · Recaps · League news'],
      ['Material', 'Injuries, trades, transactions, goalies and lines: the categories that can move a line.'],
      ['Breaking', 'Material and published within the last 2 hours.'],
      ['Clustering', 'Same category, overlapping teams, headline-word overlap of at least 0.34 (Jaccard) within 36 hours: one card with the newest report, other outlets listed as additional sources.']
    ])}
    <p>A headline is never converted into a status. A story about an injury does not make a player OUT.</p>`
  },
  {
    id: 'models',
    title: 'Model program',
    lede: 'Useful live intelligence first; models only when they earn release. Nothing below is public, and none of it produces picks today.',
    body: `<div class="mth-models">
      <article class="mth-model">
        <header><b>Expected goals (xG) baseline</b>${tag('Shadow · not public', 'unknown')}</header>
        <p>Trained on 2022-23 and 2023-24, tuned on 2024-25 and tested once on 2025-26: a strict chronological split with no shuffling. Features are limited to what is known at shot time, and an automated leakage audit runs before any test.</p>
        <p>Release criteria were frozen before the first fit: it must beat distance-only and constant baselines on log loss and Brier score, stay inside calibration bounds, hold up season by season, show zero leakage findings and score identically in production code. Even a pass keeps it in shadow; public xG is not shown until it is validated, versioned and approved.</p>
        <p class="dim">Known weakness under study: power-play shots are over-predicted.</p>
      </article>
      <article class="mth-model">
        <header><b>GSAx</b>${tag('Unavailable', 'unavailable')}</header>
        <p>Goals saved above expected needs a released xG model. It is not computed until xG is validated.</p>
      </article>
      <article class="mth-model">
        <header><b>Shots-on-goal count model</b>${tag('Shadow · not public', 'unknown')}</header>
        <p>A count model built only from information available before each game. It has not passed its frozen calibration criteria, and there are no historical closing SOG lines yet to benchmark it against the market. Not used for picks.</p>
      </article>
      <article class="mth-model">
        <header><b>Goalie saves model</b>${tag('Planned', 'sched')}</header>
        <p>Projected shots against, start status and a save-rate estimate regressed to the mean. To be judged against the closing market, not hit rate alone.</p>
      </article>
    </div>
    <p>A model is released only with a stored model version, criteria met on data it never trained on, and owner approval. Every output it produces carries that version.</p>`
  },
  {
    id: 'goalie-form',
    title: 'PBE Goalie Form (pbe-goalie-form-v1.0)',
    lede: 'A PropBetEdge 0–100 reading of a goalie\'s current form. It is not an official NHL statistic and it contains no xG or GSAx: no validated expected-goals model exists here.',
    body: `${table(['Component', 'Weight', 'Source fields', 'How it becomes 0–100'], [
      ['Recent save rate', '40%', 'Last ≤5 regular-season/playoff appearances within 60 days (game log; box score for games the log lacks)', 'Shot-weighted save rate, shrunk toward the league rate by 150 shots; 50 + (shrunk − league) ÷ 0.025 × 50, clipped 0–100. Needs ≥3 appearances and ≥60 shots.'],
      ['Season baseline', '30%', 'Season saves and shots (NHL stats); previous season until the current one has 300 shots', 'Shrunk toward the league rate by 300 shots; 50 + (shrunk − league) ÷ 0.015 × 50, clipped.'],
      ['Rest & workload', '20%', 'Appearances and starts in the last 7 days, shots faced', '100 minus: appeared yesterday 45 · 3 starts in 7 days 15 (4+: 30) · more than 100 shots in 7 days 10.'],
      ['Opponent shot volume', '10%', 'Opponent shots-for per game vs league (team stats)', '50 − (opponent − league) ÷ 4 × 50, clipped. Only for a specific game.']
    ])}
    ${defs([
      ['Score', 'Σ subscore × weight ÷ Σ available weight. Every component shows its raw value, subscore, weight and contribution; contributions sum to the score.'],
      ['Missing inputs', 'A component that cannot be computed is excluded and the rest renormalized. With less than 60% of the declared weight available, there is no score — never a guess.'],
      ['Preseason', 'Preseason games count toward workload and rest, never toward the save rate. The NHL box score has no starter flag in the preseason, so a start is recorded only when one goalie played the whole game.'],
      ['Location splits', 'High-danger / mid / long save rates on the Goalie Center are NHL Edge values exactly as the NHL publishes them, with its league average and percentile. We do not compute them.']
    ])}`
  },
  {
    id: 'fatigue',
    title: 'PBE Fatigue (pbe-fatigue-team-v1.0 · pbe-fatigue-player-v1.0)',
    lede: 'An additive burden index, 0–100, higher = more accumulated schedule and ice-time load. It is not a medical assessment and it does not claim that fatigue decides games.',
    body: `<h4 class="micro">Team</h4>
    ${table(['Component', 'Points', 'Source'], [
      ['Rest', 'back-to-back +35 · one day of rest +10', 'Club schedule'],
      ['3 games in 4 days (incl. this one)', '+12', 'Club schedule'],
      ['4 games in 6 days (incl. this one)', '+12', 'Club schedule'],
      ['Games in the previous 7 days', '3 → +6 · 4+ → +10', 'Club schedule'],
      ['Road streak (this game on the road)', '+3 per consecutive road game after the first, max +12', 'Club schedule'],
      ['Venue time-zone change since the last game', '1 h +3 · 2+ h +6', 'Venue UTC offsets in the schedule'],
      ['Previous game past regulation', 'overtime +1…+4 by minutes played · shootout +5', 'Box score (OT clock, outcome)'],
      ['Top-4 defense ice time, last 3 games vs season', '≥105% +4 · ≥110% +8', 'Box scores + NHL season ice time'],
      ['Goalie workload', 'a goalie with 3+ starts in 7 days +5', 'Box-score starter flags']
    ])}
    <h4 class="micro" style="margin-top:14px">Player</h4>
    ${table(['Component', 'Points', 'Source'], [
      ['Played yesterday', '+25', 'Box scores'],
      ['Appearances in the previous 3 days', '2+ → +10', 'Box scores'],
      ['Ice time, last 3 games vs season average', '≥108% +10 · ≥115% +20', 'Box scores + NHL season ice time'],
      ['Average ice time, last 3 games', 'D ≥21:00 +5, ≥24:00 +10 · F ≥18:00 +5, ≥20:00 +10', 'Box scores'],
      ['Short-handed ice time, last 3 games', '≥3:00 per game +5', 'NHL per-game time-on-ice report'],
      ['Overtime ice time, last game', '≥2:00 +5', 'NHL per-game time-on-ice report']
    ])}
    ${defs([
      ['Cap', 'Scores are capped at 100. Unavailable components add nothing and are labelled.'],
      ['Minimum sample', 'A player score needs three appearances in the last 21 days; before that the facts show and the score is withheld.'],
      ['Travel', 'Travel distance is not computed: no integrated source carries verified venue coordinates. The time-zone change uses each venue\'s UTC offset from the NHL schedule.'],
      ['Preseason', 'Preseason games are real games and count toward schedule load. The NHL does not publish power-play / penalty-kill / overtime splits for them, so those components stay unavailable.']
    ])}`
  },
  {
    id: 'winhl',
    title: 'WinHL (winhl-v1.0)',
    lede: 'PropBetEdge\'s skater impact metric: how much a player contributes to winning hockey, 0–100 within his position group. Built for hockey — not a port of any other sport\'s metric — and not xG, possession value, RAPM, GAR or WAR.',
    body: `${table(['Component (per game)', 'Forward weight', 'Defense weight'], [
      ['Goal creation: G + 0.7 × primary A + 0.3 × secondary A', '30%', '18%'],
      ['Shots on goal', '10%', '7%'],
      ['Individual shot attempts', '5%', '5%'],
      ['Power-play + short-handed points', '10%', '8%'],
      ['Ice time (coach trust)', '10%', '16%'],
      ['Penalty-kill ice time (deployment, not results)', '5%', '8%'],
      ['Blocked shots + takeaways', '7%', '14%'],
      ['Hits', '3%', '5%'],
      ['Penalties drawn − penalties taken', '5%', '5%'],
      ['NHL 5v5 on-ice shot-attempt share, relative to team (SAT rel, as published)', '10%', '14%'],
      ['Faceoff wins − losses (centers only)', '5%', '—']
    ])}
    ${defs([
      ['Percentiles', 'Each component is a mid-rank percentile among qualified players in the same group (forwards or defensemen; faceoffs among centers). WinHL = Σ percentile × weight ÷ Σ available weight. 50 is the median qualified player at the position.'],
      ['Qualification', '10+ games and 5:00+ per game in the window. Fewer than 20 games in the season window is flagged provisional.'],
      ['Windows', 'Season; each player\'s last 10 and last 5 regular-season games. Short windows score their per-game rates against the season distribution so a small sample cannot drift toward the middle by construction. SAT relative is season-only; short windows renormalize without it.'],
      ['Trend', 'Last-10 minus season over only the components both windows have (like for like). Up ≥ +5, down ≤ −5.'],
      ['Season choice', 'The current regular season once 200 skaters have 10+ games; before that the most recent completed season, labelled on every surface.'],
      ['Not included', 'Plus/minus (context-poor), goalies (see PBE Goalie Form), and any team-result weighting — not in v1.']
    ])}`
  },
  {
    id: 'fights',
    title: 'Fights, PBE Fight Score (pbe-fight-score-v1.0) and post-fight windows',
    lede: 'A fight is a pair of opposing fighting majors at the same stoppage in the official NHL play-by-play. The NHL never declares a winner.',
    body: `${defs([
      ['Result', 'Only the HockeyFights fan vote for that exact fight (date, period, clock, both teams, both last names). It is always labelled FAN VOTE · NOT OFFICIAL. No vote → no result.'],
      ['Decided', 'A fan vote with at least 5 votes. A named draw counts ½.'],
      ['PBE Fight Score', 'Fan-vote result share (win 1, draw ½, loss 0), each fight weighted by min(1, votes ÷ 30), shrunk toward 50 by three neutral pseudo-fights: 100 × (Σ w·result + 1.5) ÷ (Σ w + 3). No decided fight → no score. Fewer than three decisions → provisional.'],
      ['Shown, not scored', 'Fight count, fighting PIM, average opponent Fight Score and the last fight date are shown beside the score, never folded into it: activity is not quality.'],
      ['Post-fight window', 'Shot attempts, shots on goal, goals and penalties for each team in the 5:00 of game time before and after the fight (penalties at the fight stoppage excluded; windows truncated at game boundaries and flagged). Descriptive, not causal: it does not show that fighting changes play.']
    ])}`
  },
  {
    id: 'props-model',
    title: 'Player props: market vs model',
    lede: 'The Props board shows market prices. A PropBetEdge prop model is shown only after it passes every release gate — until then it runs in SHADOW and serves nothing.',
    body: `${table(['Gate', 'Meaning'], [
      ['Versioned', 'A frozen spec and version string.'],
      ['Backtest', 'Evaluated on archived official box scores.'],
      ['Held-out season', 'A season never used for fitting.'],
      ['Calibration', 'Measured calibration within the frozen criteria.'],
      ['Pregame lock', 'Predictions lock before puck drop.'],
      ['Grader', 'Graded automatically against official box scores.'],
      ['Forward record', 'An independent forward track record meets the frozen criteria.']
    ])}
    ${defs([
      ['Market consensus', 'The no-vig consensus averages each book\'s margin-free probability, and needs at least two books quoting both sides of the same line. It is market observation, never a model probability.'],
      ['Status', 'Shots on goal and goalie saves are the first models in validation. Both are SHADOW: no probability, fair line or edge is served to any client, free or Pro.']
    ])}`
  },
  {
    id: 'track',
    title: 'Track record rules',
    lede: 'How every published pick will be kept and graded.',
    body: `<ol class="mth-rules">
      <li><b>Locked before puck drop</b> with generated and locked timestamps, line, price, book and model version.</li>
      <li><b>Immutable.</b> A database trigger rejects edits to a locked prediction.</li>
      <li><b>Grades are append-only revisions.</b> Corrections add a revision; history stays visible.</li>
      <li><b>UNPRICED picks</b> (no legitimate quoted price at lock) are shown and graded but left out of units, ROI and CLV.</li>
      <li><b>Losing models display as losing.</b> No record is hidden or deleted.</li>
      <li><b>Hit rate against a league average is not edge.</b> Edge is measured against the break-even rate of the recorded prices and against the closing line.</li>
      <li><b>Shadow models never appear as picks.</b></li>
    </ol>
    <p><a class="pbe-btn" href="#/track-record">Open the Track Record</a></p>`
  },
  {
    id: 'credits',
    title: 'Image credits',
    lede: 'Every photograph on this site, where it came from and under what license. Imagery is identification and atmosphere, never an endorsement: no player, team or league endorses PropBetEdge.',
    body: () => {
      const people = portraitCredits();
      return `${defs([
        ['Page photography', 'Tony Schnagl, Pavel Danilyuk, Tima Miroshnichenko and Ron Lach, via Pexels (Pexels License). Rink, crease and terminal backgrounds on Shot Lab, Methodology and Track Record are our own drawings.'],
        ['Player portraits', `${people.length} players, from Wikimedia Commons, cropped to head and shoulders. Players without a reviewed, openly licensed photo get initials and a team mark rather than a guess.`],
        ['Brand mark', 'The PropBetEdge mark and icons are our own. No NHL or club trademark is used as an identity.']
      ])}
      ${table(['Player', 'Photographer', 'License', 'Source'], people.map(e => [
        `<a href="#/player/${esc(e.id)}">${esc(e.name)}</a>`,
        esc(e.author || 'Unknown author'),
        e.license_url ? `<a href="${esc(e.license_url)}" rel="noopener license" target="_blank">${esc(e.license)}</a>` : esc(e.license),
        `<a href="${esc(e.source_page)}" rel="noopener" target="_blank">Wikimedia Commons ↗</a>`
      ]), 'mth-table--stack mth-table--credits')}
      <p class="dim">All portraits are cropped from the original. Licenses marked BY-SA apply to our crops as well.</p>`;
    }
  }
];

export function mount(root, params = {}) {
  root.innerHTML = `<section class="wrap section mth">
    <div class="section-head section-head--editorial"><div><span class="eyebrow">Methodology</span><h2>How every number on this site is made</h2></div>
      <p>Sources, definitions and the rules we hold ourselves to. When something is missing, this page explains why it stays missing.</p></div>
    <div class="mth-layout">
      <nav class="mth-toc" aria-label="On this page">
        <details class="mth-toc__box" open>
          <summary class="micro">On this page</summary>
          <ol>${SECTIONS.map((s, i) => `<li><button type="button" class="mth-toc__btn" data-jump="${s.id}"><span class="mono">${String(i + 1).padStart(2, '0')}</span>${esc(s.title)}</button></li>`).join('')}</ol>
        </details>
      </nav>
      <article class="mth-article">
        ${SECTIONS.map((s, i) => `<section class="mth-section" id="mth-${s.id}" data-section="${s.id}" aria-labelledby="mth-h-${s.id}">
          <span class="mth-num mono">${String(i + 1).padStart(2, '0')}</span>
          <h3 id="mth-h-${s.id}" class="mth-h" tabindex="-1">${esc(s.title)}</h3>
          <p class="mth-lede">${esc(s.lede)}</p>
          <div class="mth-body">${typeof s.body === 'function' ? s.body() : s.body}</div>
        </section>`).join('')}
        <p class="micro mth-updated">Last reviewed Sep 25, 2026 · 2026-27 season</p>
      </article>
    </div>
  </section>`;

  const box = $('.mth-toc__box', root);
  const narrow = window.matchMedia('(max-width: 1024px)');
  const syncBox = () => { if (box) box.open = !narrow.matches; };
  syncBox();
  narrow.addEventListener('change', syncBox);

  const setActive = id => {
    for (const b of $$('.mth-toc__btn', root)) {
      if (b.dataset.jump === id) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    }
  };

  let observer = null;
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.dataset.section);
    }, { rootMargin: '-80px 0px -65% 0px' });
    $$('.mth-section', root).forEach(s => observer.observe(s));
  }

  const disposers = [
    on(root, 'click', '[data-jump]', (_, b) => {
      const target = $(`#mth-${b.dataset.jump}`, root);
      if (!target) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Collapse the mobile contents list first so the layout is final before scrolling.
      if (narrow.matches && box) box.open = false;
      setActive(b.dataset.jump);
      target.querySelector('.mth-h')?.focus?.({ preventScroll: true });
      requestAnimationFrame(() => target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }));
    })
  ];

  // #/methodology?section=credits (footer link) lands on that section.
  // The font stylesheet loads without blocking, so a late swap reflows
  // everything above the target: re-anchor on each font load for a few
  // seconds, and stop as soon as the reader scrolls on their own.
  let releaseAnchor = () => {};
  if (params.section && $(`#mth-${params.section}`, root)) {
    const jump = () => { const t = $(`#mth-${params.section}`, root); if (t?.isConnected) { t.scrollIntoView({ block: 'start' }); setActive(params.section); } };
    const onFonts = () => requestAnimationFrame(jump);
    const stop = () => { releaseAnchor(); };
    releaseAnchor = () => {
      document.fonts?.removeEventListener?.('loadingdone', onFonts);
      ['wheel', 'touchstart', 'keydown'].forEach(t => window.removeEventListener(t, stop));
      clearTimeout(timer);
      releaseAnchor = () => {};
    };
    document.fonts?.addEventListener?.('loadingdone', onFonts);
    ['wheel', 'touchstart', 'keydown'].forEach(t => window.addEventListener(t, stop, { passive: true, once: true }));
    const timer = setTimeout(stop, 4000);
    requestAnimationFrame(jump);
  }

  return () => {
    releaseAnchor();
    observer?.disconnect();
    narrow.removeEventListener('change', syncBox);
    disposers.forEach(d => d());
  };
}
