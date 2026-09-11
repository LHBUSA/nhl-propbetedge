// Static league directory: identity facts only (names, divisions, an accent
// colour for team-specific surfaces). No performance data lives here.
export const TEAMS = [
  ['ANA', 'Anaheim', 'Ducks', 'Western', 'Pacific', '#F47A38'],
  ['BOS', 'Boston', 'Bruins', 'Eastern', 'Atlantic', '#FFB81C'],
  ['BUF', 'Buffalo', 'Sabres', 'Eastern', 'Atlantic', '#2F6BD0'],
  ['CGY', 'Calgary', 'Flames', 'Western', 'Pacific', '#D2001C'],
  ['CAR', 'Carolina', 'Hurricanes', 'Eastern', 'Metropolitan', '#CE1126'],
  ['CHI', 'Chicago', 'Blackhawks', 'Western', 'Central', '#CF0A2C'],
  ['COL', 'Colorado', 'Avalanche', 'Western', 'Central', '#A2415E'],
  ['CBJ', 'Columbus', 'Blue Jackets', 'Eastern', 'Metropolitan', '#4F79B8'],
  ['DAL', 'Dallas', 'Stars', 'Western', 'Central', '#2E9F5B'],
  ['DET', 'Detroit', 'Red Wings', 'Eastern', 'Atlantic', '#CE1126'],
  ['EDM', 'Edmonton', 'Oilers', 'Western', 'Pacific', '#FF4C00'],
  ['FLA', 'Florida', 'Panthers', 'Eastern', 'Atlantic', '#C8102E'],
  ['LAK', 'Los Angeles', 'Kings', 'Western', 'Pacific', '#A2AAAD'],
  ['MIN', 'Minnesota', 'Wild', 'Western', 'Central', '#2E7D55'],
  ['MTL', 'Montréal', 'Canadiens', 'Eastern', 'Atlantic', '#AF1E2D'],
  ['NSH', 'Nashville', 'Predators', 'Western', 'Central', '#FFB81C'],
  ['NJD', 'New Jersey', 'Devils', 'Eastern', 'Metropolitan', '#CE1126'],
  ['NYI', 'New York', 'Islanders', 'Eastern', 'Metropolitan', '#F47D30'],
  ['NYR', 'New York', 'Rangers', 'Eastern', 'Metropolitan', '#3A6CD9'],
  ['OTT', 'Ottawa', 'Senators', 'Eastern', 'Atlantic', '#C52032'],
  ['PHI', 'Philadelphia', 'Flyers', 'Eastern', 'Metropolitan', '#F74902'],
  ['PIT', 'Pittsburgh', 'Penguins', 'Eastern', 'Metropolitan', '#FCB514'],
  ['SJS', 'San Jose', 'Sharks', 'Western', 'Pacific', '#1A9AA3'],
  ['SEA', 'Seattle', 'Kraken', 'Western', 'Pacific', '#99D9D9'],
  ['STL', 'St. Louis', 'Blues', 'Western', 'Central', '#3C6FD1'],
  ['TBL', 'Tampa Bay', 'Lightning', 'Eastern', 'Atlantic', '#3A6BD0'],
  ['TOR', 'Toronto', 'Maple Leafs', 'Eastern', 'Atlantic', '#3E6FC9'],
  ['UTA', 'Utah', 'Mammoth', 'Western', 'Central', '#6CACE4'],
  ['VAN', 'Vancouver', 'Canucks', 'Western', 'Pacific', '#2F7FC1'],
  ['VGK', 'Vegas', 'Golden Knights', 'Western', 'Pacific', '#B4975A'],
  ['WSH', 'Washington', 'Capitals', 'Eastern', 'Metropolitan', '#C8102E'],
  ['WPG', 'Winnipeg', 'Jets', 'Western', 'Central', '#5B8CC9']
].map(([abbrev, place, name, conference, division, accent]) => ({ abbrev, place, name, full: `${place} ${name}`, conference, division, accent }));

export const TEAM_BY_ABBREV = new Map(TEAMS.map(t => [t.abbrev, t]));
export const LEAGUE_TEAM_COUNT = TEAMS.length; // 32

export function teamAccent(abbrev) {
  return TEAM_BY_ABBREV.get(String(abbrev || '').toUpperCase())?.accent || '#b8b3a8';
}

// Official league logo on dark ground. Rendered with an abbreviation fallback
// so a blocked or missing asset never shows a broken image.
export function logoUrl(team = {}) {
  if (team.dark_logo) return team.dark_logo;
  if (team.logo) return String(team.logo).replace('_light.svg', '_dark.svg');
  return team.abbrev ? `https://assets.nhle.com/logos/nhl/svg/${team.abbrev}_dark.svg` : null;
}
