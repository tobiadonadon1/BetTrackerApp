export const ODDS_API_KEY = process.env.EXPO_PUBLIC_ODDS_API_KEY || '';

export const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';

// Alias used by matchResultsService
export const ODDS_API_BASE = ODDS_API_BASE_URL;

// ---------------------------------------------------------------------------
// League name → Odds API sport key mapping
// Used by matchResultsService to resolve which sport endpoint to query
// ---------------------------------------------------------------------------
export const LEAGUE_TO_SPORT_KEY: Record<string, string> = {
  // Soccer / Football
  'premier league': 'soccer_epl',
  'epl': 'soccer_epl',
  'la liga': 'soccer_spain_la_liga',
  'serie a': 'soccer_italy_serie_a',
  'bundesliga': 'soccer_germany_bundesliga',
  'ligue 1': 'soccer_france_ligue_one',
  'champions league': 'soccer_uefa_champs_league',
  'europa league': 'soccer_uefa_europa_league',
  'mls': 'soccer_usa_mls',
  'eredivisie': 'soccer_netherlands_eredivisie',
  'primeira liga': 'soccer_portugal_primeira_liga',
  'super lig': 'soccer_turkey_super_league',
  'soccer': 'soccer_epl',

  // American Football
  'nfl': 'americanfootball_nfl',
  'ncaaf': 'americanfootball_ncaaf',
  'college football': 'americanfootball_ncaaf',

  // Basketball
  'nba': 'basketball_nba',
  'wnba': 'basketball_wnba',
  'ncaab': 'basketball_ncaab',
  'euroleague': 'basketball_euroleague',

  // Baseball
  'mlb': 'baseball_mlb',

  // Hockey
  'nhl': 'icehockey_nhl',

  // Tennis
  'atp': 'tennis_atp_french_open', // fallback; real key varies by tournament
  'wta': 'tennis_wta_french_open',
  'tennis': 'tennis_atp_french_open',

  // Combat Sports
  'ufc': 'mma_mixed_martial_arts',
  'mma': 'mma_mixed_martial_arts',
  'boxing': 'boxing_boxing',

  // Golf
  'pga': 'golf_pga_championship_winner',
  'golf': 'golf_pga_championship_winner',
};

// ---------------------------------------------------------------------------
// Bet category → possible sport key prefixes
// Used as a fallback when league name matching fails
// ---------------------------------------------------------------------------
export const CATEGORY_TO_SPORT_PREFIX: Record<string, string[]> = {
  'Soccer': ['soccer_epl', 'soccer_italy_serie_a', 'soccer_spain_la_liga', 'soccer_germany_bundesliga', 'soccer_france_ligue_one'],
  'NFL': ['americanfootball_nfl'],
  'NBA': ['basketball_nba'],
  'MLB': ['baseball_mlb'],
  'NHL': ['icehockey_nhl'],
  'Tennis': ['tennis_atp_french_open', 'tennis_wta_french_open'],
  'UFC': ['mma_mixed_martial_arts'],
  'Boxing': ['boxing_boxing'],
  'Golf': ['golf_pga_championship_winner'],
  'Other': [],
};

// ---------------------------------------------------------------------------
// Fuzzy team name comparison
// Used by matchResultsService.findMatchInScores() to match bet selections
// against Odds API event data
// ---------------------------------------------------------------------------
export function teamsMatch(apiName: string, betName: string): boolean {
  if (!apiName || !betName) return false;

  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const a = normalize(apiName);
  const b = normalize(betName);

  // Exact match after normalization
  if (a === b) return true;

  // One contains the other
  if (a.includes(b) || b.includes(a)) return true;

  // Check if all words of the shorter string appear in the longer one
  const aWords = a.split(' ');
  const bWords = b.split(' ');
  const [shorter, longer] = aWords.length <= bWords.length ? [aWords, a] : [bWords, b];
  const [, longerStr] = aWords.length <= bWords.length ? [a, b] : [b, a];

  // If ≥60% of words match and at least 2 words match, consider it a match
  const matchingWords = shorter.filter(w => w.length > 1 && longerStr.includes(w));
  if (shorter.length >= 2 && matchingWords.length >= Math.ceil(shorter.length * 0.6)) {
    return true;
  }

  // Common abbreviation handling (e.g. "Man Utd" vs "Manchester United")
  const abbreviations: Record<string, string[]> = {
    'man utd': ['manchester united'],
    'man city': ['manchester city'],
    'spurs': ['tottenham hotspur', 'tottenham'],
    'wolves': ['wolverhampton wanderers', 'wolverhampton'],
    'west ham': ['west ham united'],
    'brighton': ['brighton and hove albion', 'brighton hove albion'],
    'newcastle': ['newcastle united'],
    'nottm forest': ['nottingham forest'],
    'nott forest': ['nottingham forest'],
    'sheff utd': ['sheffield united'],
    'sheff united': ['sheffield united'],
    'atletico': ['atletico madrid', 'atletico de madrid'],
    'real': ['real madrid'],
    'barca': ['barcelona', 'fc barcelona'],
    'bayern': ['bayern munich', 'bayern munchen', 'fc bayern'],
    'psg': ['paris saint germain', 'paris sg'],
    'inter': ['inter milan', 'internazionale'],
    'ac milan': ['milan'],
    'juve': ['juventus'],
    'napoli': ['ssc napoli'],
    'lazio': ['ss lazio'],
    'roma': ['as roma'],
    'dortmund': ['borussia dortmund'],
    'gladbach': ['borussia monchengladbach', 'borussia mgladbach'],
    'leverkusen': ['bayer leverkusen'],
    'leipzig': ['rb leipzig', 'rasenballsport leipzig'],
    'lyon': ['olympique lyonnais'],
    'marseille': ['olympique marseille', 'olympique de marseille'],
    'monaco': ['as monaco'],
    'lille': ['lille osc', 'losc lille'],
    'ajax': ['afc ajax'],
    'psv': ['psv eindhoven'],
    'feyenoord': ['feyenoord rotterdam'],
    'porto': ['fc porto'],
    'benfica': ['sl benfica'],
    'sporting': ['sporting cp', 'sporting lisbon'],
    'celtic': ['celtic fc'],
    'rangers': ['rangers fc'],
    'la galaxy': ['los angeles galaxy'],
    'nycfc': ['new york city fc'],
    'ny red bulls': ['new york red bulls'],
    'kc': ['kansas city'],
    'philly': ['philadelphia union'],
    'niners': ['san francisco 49ers', '49ers'],
    'bucs': ['tampa bay buccaneers', 'buccaneers'],
    'pats': ['new england patriots', 'patriots'],
    'pack': ['green bay packers', 'packers'],
    'hawks': ['atlanta hawks'],
    'celts': ['boston celtics', 'celtics'],
    'lake show': ['los angeles lakers', 'lakers'],
    'dubs': ['golden state warriors', 'warriors'],
    'yanks': ['new york yankees', 'yankees'],
    'sox': ['boston red sox', 'red sox'],
    'dodgers': ['los angeles dodgers', 'la dodgers'],
  };

  for (const [abbr, fullNames] of Object.entries(abbreviations)) {
    const abbrNorm = normalize(abbr);
    for (const fullName of fullNames) {
      const fullNorm = normalize(fullName);
      if ((a === abbrNorm && b.includes(fullNorm)) || (b === abbrNorm && a.includes(fullNorm))) return true;
      if ((a.includes(abbrNorm) && b === fullNorm) || (b.includes(abbrNorm) && a === fullNorm)) return true;
      if ((a === fullNorm && b.includes(abbrNorm)) || (b === fullNorm && a.includes(abbrNorm))) return true;
    }
  }

  return false;
}
