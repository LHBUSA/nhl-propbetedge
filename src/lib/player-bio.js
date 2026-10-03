// NHL player biography layer (nhl-player-bio/1.0.0).
//
// buildBioFacts() freezes a structured fact packet from the /nhl/player
// payload (NHL landing data normalized by propsports-api) plus, optionally,
// the stored Skater DNA snapshot. Everything visible is DERIVED from that
// packet by deterministic templates — no generative step, no hard-coded
// player, no fame score. A richer packet (long career, NHL honors) yields a
// richer biography; a missing fact shortens the text instead of being filled.
//
// Rules the tests pin:
// - every sentence carries the fact keys it was built from (evidence) and every
//   number in it is recoverable from the packet;
// - missing draft data is unknown, never "undrafted"; an empty honors list is
//   unknown, never "no awards"; inHHOF 0 is never a negative claim;
// - team chronology comes only from NHL season rows (source sequence inside a
//   traded season), never from inferred transaction dates;
// - the DNA paragraph is PropBetEdge analysis and is labeled as such — it
//   describes a statistical profile, not personality or causation.
// Prose names the player by surname rather than with pronouns.

import { TEAMS, TEAM_BY_ABBREV } from './teams.js';

export const BIO_SCHEMA = 'nhl-player-bio/1.0.0';

const POSITION = { C: 'center', L: 'left wing', R: 'right wing', D: 'defenseman', G: 'goaltender' };
const COUNTRY = {
  CAN: 'Canada', USA: 'United States', SWE: 'Sweden', FIN: 'Finland', RUS: 'Russia', CZE: 'Czechia', SVK: 'Slovakia',
  CHE: 'Switzerland', DEU: 'Germany', LVA: 'Latvia', DNK: 'Denmark', NOR: 'Norway', AUT: 'Austria', SVN: 'Slovenia',
  BLR: 'Belarus', UKR: 'Ukraine', KAZ: 'Kazakhstan', FRA: 'France', GBR: 'United Kingdom', AUS: 'Australia', NLD: 'Netherlands',
  ITA: 'Italy', POL: 'Poland', JPN: 'Japan', KOR: 'South Korea', HUN: 'Hungary', EST: 'Estonia', LTU: 'Lithuania', BRA: 'Brazil',
  NGA: 'Nigeria', JAM: 'Jamaica', HTI: 'Haiti', ZAF: 'South Africa', VEN: 'Venezuela', KOS: 'Kosovo', TWN: 'Taiwan', CHN: 'China',
  BHS: 'Bahamas', TZA: 'Tanzania', BRN: 'Brunei', SRB: 'Serbia', HRV: 'Croatia', IRL: 'Ireland', SCO: 'Scotland', MEX: 'Mexico'
};
// Draft-day names for franchises whose current name differs from the one that
// drafted. An abbreviation not covered here is omitted rather than guessed.
const DRAFT_NAMES = {
  UTA: y => (y >= 2025 ? 'Utah Mammoth' : 'Utah Hockey Club'),
  ARI: () => 'Arizona Coyotes', PHX: () => 'Phoenix Coyotes', ATL: () => 'Atlanta Thrashers',
  HFD: () => 'Hartford Whalers', QUE: () => 'Quebec Nordiques', MNS: () => 'Minnesota North Stars',
  ANA: y => (y <= 2005 ? 'Mighty Ducks of Anaheim' : 'Anaheim Ducks')
};
const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const TIMES = ['', 'once', 'twice', 'three times', 'four times', 'five times', 'six times', 'seven times', 'eight times', 'nine times', 'ten times'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const txt = v => (v && typeof v === 'object' ? v.default || '' : v || '');
const fin = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const thousands = v => Number(v).toLocaleString('en-US');
const ordinal = k => {
  if (k <= 10) return ORDINAL[k];
  const t = k % 100;
  const s = t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[k % 10] || 'th';
  return `${k}${s}`;
};
const times = k => TIMES[k] || `${k} times`;
const listText = items => (items.length <= 1 ? items.join('') : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
export const seasonText = s => {
  const t = String(s ?? '');
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}–${t.slice(6, 8)}` : '';
};
const svText = v => (fin(v) === null ? null : Number(v).toFixed(3).replace(/^0/, ''));
const ymdShort = ymd => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : null;
};
const ymdLong = ymd => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${MONTHS_LONG[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : null;
};

const TEAM_BY_FULL = new Map(TEAMS.map(t => [t.full.toLowerCase(), t.abbrev]));
const teamAbbrevFor = name => TEAM_BY_FULL.get(String(name || '').toLowerCase()) || null;

function draftTeamName(abbrev, year) {
  if (!abbrev) return null;
  if (DRAFT_NAMES[abbrev]) return DRAFT_NAMES[abbrev](year ?? 0);
  return TEAM_BY_ABBREV.get(abbrev)?.full || null;
}

// NHL rows with games, one entry per (season, game type), clubs in source
// sequence. A season appears once however many clubs it has.
function nhlSeasons(rows, gameType) {
  const bySeason = new Map();
  for (const r of rows || []) {
    if (r?.leagueAbbrev !== 'NHL' || Number(r.gameTypeId) !== gameType) continue;
    const season = fin(r.season);
    if (season === null) continue;
    const list = bySeason.get(season) || [];
    list.push(r);
    bySeason.set(season, list);
  }
  return [...bySeason.entries()].sort((a, b) => a[0] - b[0]).map(([season, list]) => {
    const ordered = list.slice().sort((a, b) => (fin(a.sequence) ?? 0) - (fin(b.sequence) ?? 0));
    const clubs = [];
    for (const r of ordered) {
      const name = txt(r.teamName);
      if (!name) continue;
      const club = clubs.find(c => c.name === name);
      if (club) club.gp += fin(r.gamesPlayed) ?? 0;
      else clubs.push({ name, abbrev: teamAbbrevFor(name), gp: fin(r.gamesPlayed) ?? 0 });
    }
    const sum = k => list.reduce((a, r) => (fin(r[k]) === null ? a : (a ?? 0) + Number(r[k])), null);
    return { season, clubs, gp: sum('gamesPlayed'), goals: sum('goals'), assists: sum('assists'), points: sum('points'), wins: sum('wins'), shutouts: sum('shutouts') };
  }).filter(s => (s.gp ?? 0) > 0);
}

// Latest DNA snapshot that is ranked and carries stored traits. The browser
// never recomputes a trait; it only reads the stored lists.
function dnaStyle(dna) {
  const snaps = [...(dna?.snapshots || [])].filter(s => s?.kind === 'skater').sort((a, b) => a.season - b.season);
  if (!snaps.length) return null;
  const active = dna.history?.active_season;
  const snap = snaps.find(s => s.season === active) || snaps[snaps.length - 1];
  const t = snap?.traits;
  const pop = fin(snap?.population?.n);
  if (!t || !pop || (!t.strongest?.length && !t.watch?.length)) return null;
  const pick = keys => (keys || []).map(k => ({ key: k, score: fin(snap.dimensions?.[k]?.score) })).filter(d => d.score !== null);
  const strongest = pick(t.strongest);
  const watch = pick(t.watch);
  if (!strongest.length && !watch.length) return null;
  return { season: snap.season, peer_group: snap.peer_group || null, population_n: pop, version: String(snap.version || '').split('/').pop() || null, rules: t.rules || null, strongest, watch };
}

const DIM_TEXT = {
  shot_generation: 'shot generation', shot_location: 'shot location', goal_scoring: 'goal scoring', finishing: 'finishing',
  playmaking: 'playmaking', power_play: 'power-play production', faceoffs: 'faceoffs', shot_blocking: 'shot blocking',
  physicality: 'physicality', penalty_differential: 'penalty differential'
};
const PEER_TEXT = { forward: 'forwards', defense: 'defensemen', defenseman: 'defensemen', F: 'forwards', D: 'defensemen' };

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
// FNV-1a 32-bit: a reproducible fingerprint of the evidence, not a security hash.
export function evidenceHash(facts) {
  const s = stableJson(facts);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// p: /nhl/player data.player. dna: Skater DNA history payload or null.
export function buildBioFacts(p, { dna = null } = {}) {
  if (!p || fin(p.id) === null) return null;
  const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
  if (!name) return null;
  const goalie = p.position === 'G';
  const reg = nhlSeasons(p.season_totals, 2);
  const post = nhlSeasons(p.season_totals, 3);
  const allSeasons = [...new Set([...reg, ...post].map(s => s.season))].sort((a, b) => a - b);

  const teams = [];
  for (const s of [...reg, ...post].sort((a, b) => a.season - b.season)) {
    for (const c of s.clubs) {
      const t = teams.find(x => x.name === c.name);
      if (t) { t.last_season = Math.max(t.last_season, s.season); if (!t.seasons.includes(s.season)) t.seasons.push(s.season); }
      else teams.push({ name: c.name, abbrev: c.abbrev, first_season: s.season, last_season: s.season, seasons: [s.season] });
    }
  }

  const ct = p.career_totals || {};
  const careerLine = r => (r && fin(r.gamesPlayed) ? (goalie
    ? { gp: fin(r.gamesPlayed), wins: fin(r.wins), losses: fin(r.losses), ot_losses: fin(r.otLosses), save_pct: fin(r.savePctg), gaa: fin(r.goalsAgainstAvg), shutouts: fin(r.shutouts) }
    : { gp: fin(r.gamesPlayed), goals: fin(r.goals), assists: fin(r.assists), points: fin(r.points), pp_goals: fin(r.powerPlayGoals), gw_goals: fin(r.gameWinningGoals) }) : null);

  const draft = p.draft && (fin(p.draft.year) !== null || fin(p.draft.overall_pick) !== null)
    ? { year: fin(p.draft.year), team_abbrev: p.draft.team_abbrev || null, team_name: draftTeamName(p.draft.team_abbrev, fin(p.draft.year)), round: fin(p.draft.round), pick_in_round: fin(p.draft.pick_in_round), overall_pick: fin(p.draft.overall_pick) }
    : null;

  const honors = (Array.isArray(p.honors) ? p.honors : [])
    .map(h => ({ trophy: String(h?.trophy || ''), seasons: [...new Set((h?.seasons || []).map(s => fin(s?.season)).filter(v => v !== null))].sort((a, b) => a - b) }))
    .filter(h => h.trophy && h.seasons.length);
  // Cup winning club: only when exactly one NHL club has playoff games that season.
  const cup = honors.find(h => /^stanley cup$/i.test(h.trophy));
  const cups = cup ? cup.seasons.map(season => {
    const clubs = post.find(s => s.season === season)?.clubs || [];
    return { season, team: clubs.length === 1 ? clubs[0].name : null };
  }) : [];

  const games = (p.last_5_games || []).map(g => g?.gameDate).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).sort();
  const latestReg = reg[reg.length - 1] || null;
  // Most recent season with a meaningful sample (10+ GP) for the season line.
  const fullReg = [...reg].reverse().find(s => (s.gp ?? 0) >= 10) || null;
  const seasonLine = s => (s ? { season: s.season, gp: s.gp, goals: s.goals, assists: s.assists, points: s.points, wins: s.wins, shutouts: s.shutouts, clubs: s.clubs.map(c => c.name) } : null);

  const facts = {
    schema: BIO_SCHEMA,
    player_id: fin(p.id),
    stats_through: games.length ? games[games.length - 1] : null,
    identity: {
      name,
      last_name: p.last_name || name.split(' ').slice(-1)[0],
      position: p.position || null,
      position_text: POSITION[p.position] || null,
      goalie,
      active: p.is_active === true ? true : p.is_active === false ? false : null,
      current_team: p.current_team_name ? { abbrev: p.current_team_abbrev || null, name: p.current_team_name } : null,
      birth_date: /^\d{4}-\d{2}-\d{2}$/.test(p.birth_date || '') ? p.birth_date : null,
      birth_city: txt(p.birth_city) || null,
      birth_region: txt(p.birth_state_province) || null,
      birth_country: p.birth_country || null,
      birth_country_name: COUNTRY[p.birth_country] || null
    },
    draft,
    career: {
      first_season: allSeasons[0] ?? null,
      last_season: allSeasons[allSeasons.length - 1] ?? null,
      regular_seasons: reg.length,
      regular: careerLine(ct.regularSeason),
      playoffs: careerLine(ct.playoffs),
      playoff_seasons: post.length,
      latest_regular: seasonLine(latestReg),
      recent_full_regular: seasonLine(fullReg)
    },
    teams,
    journey: reg.map(s => ({ season: s.season, clubs: s.clubs, gp: s.gp, goals: s.goals, points: s.points, wins: s.wins })),
    honors,
    cups,
    recognitions: [...new Set([
      ...(Array.isArray(p.badges) ? p.badges.filter(b => typeof b === 'string' && b) : []),
      ...(p.in_hhof === true ? ['Hockey Hall of Fame'] : [])
    ].map(r => (/hall of fame/i.test(r) ? 'Hockey Hall of Fame' : r)))],
    style: goalie ? null : dnaStyle(dna),
    sources: ['NHL']
  };
  if (facts.style) facts.sources.push('PropBetEdge Skater DNA');
  facts.evidence_hash = evidenceHash(facts);
  return facts;
}

// ---------------------------------------------------------------- prose
// Each sentence: { text, evidence: [fact paths] }. Paragraph kind 'nhl' is
// built from NHL facts only; kind 'pbe' is PropBetEdge analysis.
export function bioParagraphs(f) {
  if (!f) return [];
  const id = f.identity;
  const who = id.last_name;
  const active = id.active !== false;
  const out = [];

  // 1. Who, where from, how he entered the league.
  const p1 = [];
  if (id.position_text && id.current_team && active) {
    p1.push({ text: `${id.name} is a${/^[aeiou]/.test(id.position_text) ? 'n' : ''} ${id.position_text} for the ${id.current_team.name}.`, evidence: ['identity.name', 'identity.position', 'identity.current_team'] });
  } else if (id.position_text && id.active === false && f.teams.length) {
    p1.push({ text: `${id.name} is a former NHL ${id.position_text}.`, evidence: ['identity.name', 'identity.position', 'identity.active'] });
  } else if (id.position_text) {
    p1.push({ text: `${id.name} is an NHL ${id.position_text}.`, evidence: ['identity.name', 'identity.position'] });
  }
  const place = [id.birth_city, id.birth_region, id.birth_country_name].filter(Boolean).join(', ');
  const born = ymdLong(id.birth_date);
  const bornText = `${born ? ` on ${born},` : ''}${place ? ` in ${place}` : ''}`.replace(/,$/, '');
  const bornEvidence = ['identity.birth_date', 'identity.birth_city', 'identity.birth_country'];
  const d = f.draft;
  if (d && d.year !== null) {
    const pick = d.overall_pick !== null ? ` ${ordinal(d.overall_pick)} overall` : '';
    const by = d.team_name ? ` by the ${d.team_name}` : '';
    const round = d.round !== null && d.overall_pick !== null && d.round > 1 ? ` (round ${d.round})` : '';
    const lead = bornText ? `Born${bornText}, ${who}` : who;
    p1.push({ text: `${lead} was selected${pick}${by} in the ${d.year} NHL Draft${round}.`, evidence: [...(bornText ? bornEvidence : []), 'draft'] });
  } else if (bornText) {
    p1.push({ text: `${who} was born${bornText}.`, evidence: bornEvidence });
  }
  if (p1.length) out.push({ kind: 'nhl', sentences: p1 });

  // 2. Career span, clubs, numbers.
  const p2 = [];
  const c = f.career;
  if (c.first_season !== null && f.teams.length) {
    const n = c.regular_seasons;
    const names = f.teams.map(t => `the ${t.name}`);
    const clubs = f.teams.length === 1
      ? (n > 1 ? `all with the ${f.teams[0].name}` : `with the ${f.teams[0].name}`)
      : `with ${listText(names)}`;
    if (n === 0) {
      p2.push({ text: `${who} made an NHL playoff debut in ${seasonText(c.first_season)} ${clubs}.`, evidence: ['career.first_season', 'teams'] });
    } else if (n === 1) {
      p2.push({ text: `${who} made an NHL debut in ${seasonText(c.first_season)}, ${clubs}.`, evidence: ['career.first_season', 'career.regular_seasons', 'teams'] });
    } else if (!active) {
      p2.push({ text: `${who} played ${n} NHL regular seasons between ${seasonText(c.first_season)} and ${seasonText(c.last_season)}, ${clubs}.`, evidence: ['career.first_season', 'career.last_season', 'career.regular_seasons', 'teams'] });
    } else {
      p2.push({ text: `${who} has appeared in ${n} NHL regular seasons since debuting in ${seasonText(c.first_season)}, ${clubs}.`, evidence: ['career.first_season', 'career.regular_seasons', 'teams'] });
    }
  }
  const r = c.regular;
  if (r) {
    const has = active ? 'has' : 'finished with';
    const playoffs = c.playoffs;
    if (id.goalie) {
      const parts = [r.wins !== null ? `${thousands(r.wins)} wins` : null, svText(r.save_pct) ? `a ${svText(r.save_pct)} save percentage` : null, r.gaa !== null ? `a ${Number(r.gaa).toFixed(2)} goals-against average` : null, r.shutouts !== null ? `${thousands(r.shutouts)} shutout${r.shutouts === 1 ? '' : 's'}` : null].filter(Boolean);
      if (parts.length) {
        const tail = playoffs?.gp && playoffs.wins !== null ? `, plus ${thousands(playoffs.wins)} win${playoffs.wins === 1 ? '' : 's'} in ${thousands(playoffs.gp)} playoff game${playoffs.gp === 1 ? '' : 's'}` : '';
        p2.push({ text: `${who} ${has} ${listText(parts)} in ${thousands(r.gp)} regular-season game${r.gp === 1 ? '' : 's'}${tail}.`, evidence: ['career.regular', 'career.playoffs'] });
      }
    } else if (r.goals !== null && r.points !== null) {
      const tail = playoffs?.gp && playoffs.points !== null ? `, plus ${thousands(playoffs.points)} point${playoffs.points === 1 ? '' : 's'} in ${thousands(playoffs.gp)} playoff game${playoffs.gp === 1 ? '' : 's'}` : '';
      p2.push({ text: `${who} ${has} ${thousands(r.goals)} goal${r.goals === 1 ? '' : 's'}${r.assists !== null ? `, ${thousands(r.assists)} assist${r.assists === 1 ? '' : 's'}` : ''} and ${thousands(r.points)} point${r.points === 1 ? '' : 's'} in ${thousands(r.gp)} regular-season game${r.gp === 1 ? '' : 's'}${tail}.`, evidence: ['career.regular', 'career.playoffs'] });
    }
  }
  // Recent context: the latest 10+ GP season, then a season in progress.
  const full = c.recent_full_regular;
  const lr = c.latest_regular;
  if (active && full && c.regular_seasons > 1) {
    const line = id.goalie
      ? (full.wins !== null ? `${thousands(full.wins)} win${full.wins === 1 ? '' : 's'}${full.shutouts ? ` and ${thousands(full.shutouts)} shutout${full.shutouts === 1 ? '' : 's'}` : ''} in ${thousands(full.gp)} games` : null)
      : (full.goals !== null && full.points !== null ? `${thousands(full.goals)} goal${full.goals === 1 ? '' : 's'} and ${thousands(full.points)} point${full.points === 1 ? '' : 's'} in ${thousands(full.gp)} games` : null);
    if (line) p2.push({ text: `In ${seasonText(full.season)}, ${who} recorded ${line}.`, evidence: ['career.recent_full_regular'] });
    if (lr && lr.season > full.season) {
      p2.push({ text: `${who} has played ${thousands(lr.gp)} game${lr.gp === 1 ? '' : 's'} of ${seasonText(lr.season)}.`, evidence: ['career.latest_regular'] });
    }
  }
  if (p2.length) out.push({ kind: 'nhl', sentences: p2 });

  // 3. Honors and recognitions — only what the NHL record lists.
  const p3 = [];
  const cupWins = f.cups.filter(x => x.season);
  if (cupWins.length) {
    const withTeam = cupWins.every(x => x.team) && new Set(cupWins.map(x => x.team)).size === 1 ? ` with the ${cupWins[0].team}` : '';
    p3.push({ text: `${who} won the Stanley Cup${withTeam} in ${listText(cupWins.map(x => seasonText(x.season)))}.`, evidence: ['cups', 'honors'] });
  }
  const trophies = f.honors.filter(h => !/^stanley cup$/i.test(h.trophy))
    .sort((a, b) => b.seasons.length - a.seasons.length || a.trophy.localeCompare(b.trophy));
  if (trophies.length) {
    const multi = trophies.filter(h => h.seasons.length > 1).map(h => `the ${h.trophy} ${times(h.seasons.length)}`);
    const single = trophies.filter(h => h.seasons.length === 1).map(h => `the ${h.trophy} (${seasonText(h.seasons[0])})`);
    p3.push({ text: `${who} ${active ? 'has won' : 'won'} ${listText([...multi, ...single])}.`, evidence: ['honors'] });
  }
  for (const rec of f.recognitions) {
    if (/hall of fame/i.test(rec)) p3.push({ text: `The NHL record lists ${who} as a member of the Hockey Hall of Fame.`, evidence: ['recognitions'] });
    else if (/100 greatest/i.test(rec)) p3.push({ text: `The NHL names ${who} among its 100 Greatest Players.`, evidence: ['recognitions'] });
  }
  if (p3.length) out.push({ kind: 'nhl', sentences: p3 });

  // 4. Statistical profile — PropBetEdge analysis of NHL data, never an NHL statement.
  const s = f.style;
  if (s) {
    const peer = PEER_TEXT[s.peer_group] || 'peers';
    const strong = s.strongest.map(x => `${DIM_TEXT[x.key] || x.key} (${x.score})`);
    const watch = s.watch.map(x => DIM_TEXT[x.key] || x.key);
    const p4 = [];
    if (strong.length) p4.push({ text: `In ${seasonText(s.season)}, ${who}'s strongest PropBetEdge Skater DNA dimensions among ${thousands(s.population_n)} qualified ${peer} were ${listText(strong)}, on a 0–100 scale.`, evidence: ['style.strongest', 'style.population_n', 'style.season'] });
    if (watch.length) p4.push({ text: `The lower-scoring areas of the same profile were ${listText(watch)}.`, evidence: ['style.watch'] });
    out.push({ kind: 'pbe', sentences: p4 });
  }
  return out;
}

// ---------------------------------------------------------------- rail
// Rows: [label, value]. Unknown values read '—'; rows that can never apply to
// this player (no NHL history at all) are omitted, not shown empty.
export function careerGlance(f) {
  if (!f) return [];
  const c = f.career;
  const r = c.regular;
  const po = c.playoffs;
  const rows = [];
  rows.push(['NHL debut', c.first_season !== null ? seasonText(c.first_season) : '—']);
  const d = f.draft;
  rows.push(['Draft', d && d.year !== null
    ? [String(d.year), d.round !== null ? `Rd ${d.round}` : null, d.overall_pick !== null ? `#${d.overall_pick} overall` : null, d.team_abbrev].filter(Boolean).join(' · ')
    : '—']);
  if (c.first_season === null) return rows;
  rows.push(['NHL seasons', String(c.regular_seasons)]);
  rows.push([f.teams.length === 1 ? 'Team' : 'Teams', f.teams.length === 1 ? f.teams[0].name : String(f.teams.length)]);
  rows.push(['Career GP', r ? thousands(r.gp) : '—']);
  if (f.identity.goalie) {
    rows.push(['W-L-OTL', r && r.wins !== null ? `${thousands(r.wins)}-${r.losses ?? '—'}-${r.ot_losses ?? '—'}` : '—']);
    rows.push(['SV% / GAA', r && (r.save_pct !== null || r.gaa !== null) ? `${svText(r.save_pct) ?? '—'} / ${r.gaa !== null ? Number(r.gaa).toFixed(2) : '—'}` : '—']);
    rows.push(['Shutouts', r && r.shutouts !== null ? thousands(r.shutouts) : '—']);
    rows.push(['Playoff GP', po ? thousands(po.gp) : '—']);
  } else {
    rows.push(['G / A / P', r && r.goals !== null ? `${thousands(r.goals)} / ${r.assists !== null ? thousands(r.assists) : '—'} / ${r.points !== null ? thousands(r.points) : '—'}` : '—']);
    rows.push(['Playoff GP', po ? thousands(po.gp) : '—']);
    if (po && po.points !== null) rows.push(['Playoff P', thousands(po.points)]);
  }
  const cups = f.cups.length;
  if (cups) rows.push(['Stanley Cups', String(cups)]);
  return rows;
}

// Source disclosure lines for the bio.
export function bioSources(f) {
  if (!f) return [];
  const through = ymdShort(f.stats_through);
  const lines = [`Biography facts: NHL · career statistics ${through ? `through ${through}` : f.identity.active === false && f.career.last_season ? `final (last NHL season ${seasonText(f.career.last_season)})` : 'as published by the NHL'}`];
  if (f.style) lines.push(`Statistical profile: PropBetEdge analysis of NHL data (Skater DNA${f.style.version ? ` ${f.style.version}` : ''}, ${seasonText(f.style.season)})`);
  return lines;
}
