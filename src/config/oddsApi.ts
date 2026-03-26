const rawOddsApiKey = (process.env.EXPO_PUBLIC_ODDS_API_KEY || '').trim();
const FALLBACK_ODDS_KEY = '544ad1e4ee809b0f9101b097cdd23d55';

export const ODDS_API_KEY =
  rawOddsApiKey && !rawOddsApiKey.includes('your-the-odds-api-key-here')
    ? rawOddsApiKey
    : FALLBACK_ODDS_KEY;
export const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

export const LEAGUE_TO_SPORT_KEY: Record<string, string> = {
  'serie a': 'soccer_italy_serie_a',
  'ita serie a': 'soccer_italy_serie_a',
  'italy serie a': 'soccer_italy_serie_a',
  'premier league': 'soccer_epl',
  'epl': 'soccer_epl',
  'la liga': 'soccer_spain_la_liga',
  'bundesliga': 'soccer_germany_bundesliga',
  'ligue 1': 'soccer_france_ligue_one',
  'champions league': 'soccer_uefa_champions_league',
  'ucl': 'soccer_uefa_champions_league',
  'nba': 'basketball_nba',
  'nfl': 'americanfootball_nfl',
  'nhl': 'icehockey_nhl',
  'mlb': 'baseball_mlb',
};

export const CATEGORY_TO_SPORT_PREFIX: Record<string, string[]> = {
  Soccer: ['soccer_'],
  NBA: ['basketball_nba'],
  NFL: ['americanfootball_nfl'],
  MLB: ['baseball_mlb'],
  NHL: ['icehockey_nhl'],
};

export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['`]/g, '')
    .replace(/\b(fc|cf|ac|as|ss|sc|us|afc|bsc|rc|cd|ud|rcd|sd|ca)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = na.split(' ').filter(w => w.length > 2);
  const wordsB = nb.split(' ').filter(w => w.length > 2);
  const overlap = wordsA.filter(w => wordsB.includes(w));
  return overlap.length >= 1 && overlap.length >= Math.min(wordsA.length, wordsB.length) * 0.5;
}
