// Pure alert rules: (previous snapshot, next snapshot, watched ids) -> alerts.
// First observation of anything PRIMES its keys without alerting, so opening
// the app never replays history as "new" (MLB PBEcast pattern).
// Every alert carries a stable key; the bus drops keys it has already seen.

const matchup = g => `${g.teams?.away?.abbrev || 'AWY'} @ ${g.teams?.home?.abbrev || 'HOM'}`;
const DISRUPTED = new Set(['POSTPONED', 'SUSPENDED', 'CANCELLED']);

export function boardAlerts(prev, next, watched = new Set()) {
  const alerts = [];
  const prime = [];
  const before = new Map((prev?.games || []).map(g => [String(g.id), g]));
  for (const g of next?.games || []) {
    const id = String(g.id);
    const sem = g.status?.semantics;
    const old = before.get(id);
    const scoreKey = `game:${id}:score:${g.teams?.away?.score ?? '-'}-${g.teams?.home?.score ?? '-'}`;
    const stateKey = `game:${id}:state:${sem}`;
    const timeKey = `game:${id}:start:${g.start_time_utc}`;
    if (!prev || !old) {
      prime.push(stateKey, scoreKey, timeKey);
      // A game that is already disrupted when first seen still matters.
      if (DISRUPTED.has(sem)) alerts.push({ key: stateKey, kind: 'schedule', severity: 'high', title: `${matchup(g)} ${sem.toLowerCase()}`, body: 'Official schedule state. Bets on this game may be voided under your book’s rules.', href: `#/cast/${id}`, source: 'NHL schedule', game_id: id });
      continue;
    }
    const oldSem = old.status?.semantics;
    if (sem !== oldSem) {
      if (DISRUPTED.has(sem)) {
        alerts.push({ key: stateKey, kind: 'schedule', severity: 'high', title: `${matchup(g)} ${sem.toLowerCase()}`, body: 'Official schedule state changed. Check how your book settles affected bets.', href: `#/cast/${id}`, source: 'NHL schedule', game_id: id });
      } else if (watched.has(id) && sem === 'LIVE' && ['SCHEDULED', 'PREGAME'].includes(oldSem)) {
        alerts.push({ key: stateKey, kind: 'game', severity: 'low', title: `Puck drop: ${matchup(g)}`, body: 'Now live in PBE Cast.', href: `#/cast/${id}`, source: 'NHL', game_id: id });
      } else if (watched.has(id) && sem === 'FINAL') {
        alerts.push({ key: stateKey, kind: 'game', severity: 'low', title: `Final: ${g.teams.away.abbrev} ${g.teams.away.score}, ${g.teams.home.abbrev} ${g.teams.home.score}`, body: 'Replay it event by event.', href: `#/cast/${id}`, source: 'NHL', game_id: id });
      }
    }
    if (old.start_time_utc && g.start_time_utc && old.start_time_utc !== g.start_time_utc && !['LIVE', 'FINAL'].includes(sem)) {
      alerts.push({ key: timeKey, kind: 'schedule', severity: watched.has(id) ? 'high' : 'medium', title: `${matchup(g)} start time changed`, body: `Now ${g.start_time_utc} (was ${old.start_time_utc}).`, href: `#/cast/${id}`, source: 'NHL schedule', game_id: id });
    }
    const scored = (g.teams?.away?.score ?? 0) + (g.teams?.home?.score ?? 0) > (old.teams?.away?.score ?? 0) + (old.teams?.home?.score ?? 0);
    if (watched.has(id) && sem === 'LIVE' && scored) {
      alerts.push({ key: scoreKey, kind: 'goal', severity: 'medium', title: `Goal: ${g.teams.away.abbrev} ${g.teams.away.score}, ${g.teams.home.abbrev} ${g.teams.home.score}`, body: 'Open PBE Cast for the shot location and play.', href: `#/cast/${id}`, source: 'NHL', game_id: id });
    } else {
      prime.push(scoreKey);
    }
  }
  return { alerts, prime };
}

// Goalie starter truth-level transitions for one game payload (/goalies).
export function goalieAlerts(prev, next) {
  const alerts = [];
  const prime = [];
  const id = String(next?.game_id || '');
  for (const side of ['away', 'home']) {
    const t = next?.teams?.[side];
    if (!t?.starter) continue;
    const key = `goalie:${id}:${side}:${t.starter.status}:${t.starter.goalie_id ?? 'none'}`;
    const was = prev?.teams?.[side]?.starter;
    if (!prev || !was) { prime.push(key); continue; }
    if (was.status === t.starter.status && was.goalie_id === t.starter.goalie_id) { prime.push(key); continue; }
    if (t.starter.status === 'CONFIRMED') {
      alerts.push({ key, kind: 'goalie', severity: 'high', title: `Starter confirmed: ${t.starter.name || 'goalie'} (${t.team})`, body: t.starter.basis, href: `#/goalies/${id}`, source: t.starter.source || 'NHL', game_id: id });
    } else if (was.status === 'CONFIRMED' && t.starter.status !== 'CONFIRMED') {
      alerts.push({ key, kind: 'goalie', severity: 'high', title: `Starter status changed (${t.team})`, body: `Was ${was.name || 'confirmed'}; now ${t.starter.status}.`, href: `#/goalies/${id}`, source: t.starter.source || 'NHL', game_id: id });
    }
  }
  return { alerts, prime };
}

// Breaking material newsroom items. First load primes.
export function newsAlerts(prevItems, items) {
  const known = new Set((prevItems || []).map(i => i.id));
  const alerts = [];
  const prime = [];
  for (const i of items || []) {
    const key = `news:${i.id}`;
    if (!prevItems) { prime.push(key); continue; }
    if (known.has(i.id) || !i.breaking) { prime.push(key); continue; }
    alerts.push({ key, kind: 'news', severity: 'medium', title: i.title, body: `${i.category} · ${i.source}`, href: i.url, external: true, source: i.source, teams: i.teams });
  }
  return { alerts, prime };
}
