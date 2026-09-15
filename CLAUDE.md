# Claude Code instructions — NHL PropBetEdge

Read `docs/NHL_UFC2_CLAUDE_CODE_MASTER_BRIEF.md` completely before making product changes. It is the authoritative build brief for this branch.

## Working scope

Frontend repo: `LHBUSA/nhl-propbetedge` — branch `main` only (main is production; Vercel auto-deploys it).
Backend repo: `LHBUSA/propsports-api-worker` — branch `main` only (Workers deploy via wrangler from a clean export of main).
Shared billing: `LHBUSA/propbetedge-workers` — `main` only.

No feature/preview branches, forks or PRs. No new GitHub Actions.

Quality references only (inspect, do not blindly copy):
- `LHBUSA/UFC`
- `LHBUSA/nfl-propbetedge-new`
- NFL `PROPBETEDGE_DESIGN_SYSTEM.md`

## Absolute guardrails

- Test before every push to `main` (it is production). Do not deploy production Cloudflare Workers without verification and the owner's standing approval.
- NHL Pro access is decided only by nhl-gateway (server-side session + billing ledger). Paid values are never serialized to a free client.
- Cloudflare Workers remain the API/runtime/scheduler architecture. GitHub Actions are CI/deploy helpers only, never the recurring production runtime.
- Do not replace the stack or restart from a new framework. Build on the existing Vite/Vercel frontend branch.
- Never fabricate a sports value. No randomized shot coordinates, fake injuries, guessed goalie confirmations, fake odds, demo books, invented line combinations, or pretend model probabilities in production paths.
- `null` / unavailable / unknown is better than a fabricated fact.
- Raw geometric shot danger is not xG. Do not display xG/GSAx until a real versioned model is trained and validated.
- Preserve source/freshness/stale semantics for time-sensitive data.
- Never expose PropSports private keys, sportsbook keys, Supabase service-role keys, or other secrets in browser code.
- Do not break MLB/NFL behavior when touching `propsports-api-worker`; run shared regressions.
- Production ingest/refresh scheduling belongs in Cloudflare cron/queues, not GitHub scheduled workflows.

## Product priorities

1. Premium NHL visual shell with a legally usable, locally stored, optimized background image.
2. Ice Board / today's games.
3. PBE Cast — full live/replay play-by-play + real rink shot map + game intelligence.
4. Goalies and starter-change tracking.
5. Lines / scratches / availability changes.
6. Injury desk.
7. NHL newsroom / "what changed today".
8. Odds + props with freshness and line movement.
9. Shot Lab, Matchups, Players, Standings.
10. Historical backfill, shadow models, immutable track record.

## Workflow

Audit first, then implement. Keep working through reversible tasks without asking for approval after every step. Stop only for a real external blocker, missing secret, licensing issue, or irreversible production action.

Maintain `docs/NHL_BUILD_STATUS.md` with proven status vs blocked status. A successful build alone does not mean production ready. Before recommending promotion, provide desktop/mobile screenshots, source canaries, CI status, console-error check, overflow check, and a clear list of anything still degraded or unverified.
