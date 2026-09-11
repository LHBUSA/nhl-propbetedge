# PropBetEdge NHL

Production NHL prop-intelligence frontend for `nhl.propbetedge.ai`.

Frontend: Vite + Vercel
Data/API: browser → Cloudflare `nhl-gateway` (`https://nhl-api.propbetedge.ai`) → PropSports API Worker (service binding). Vercel serves static files only; no data proxy or credentials in Vercel. Gateway source: `LHBUSA/propsports-api-worker/nhl-gateway`.
Persistence/model outputs: Supabase

Active product work is developed on feature branches and promoted to `main` after preview verification.
