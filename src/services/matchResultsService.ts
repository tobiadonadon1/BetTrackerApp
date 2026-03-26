import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ODDS_API_KEY,
  ODDS_API_BASE,
  LEAGUE_TO_SPORT_KEY,
  CATEGORY_TO_SPORT_PREFIX,
  teamsMatch,
} from '../config/oddsApi';

export interface OddsApiScore {
  id: string;
  sport_key: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
}

export interface MatchResult {
  status: 'scheduled' | 'live' | 'completed';
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  commenceTime: string;
  betOutcome: 'won' | 'lost' | null;
}

const scoreCache = new Map<string, { data: OddsApiScore[]; fetchedAt: number }>();
const inFlightRequests = new Map<string, Promise<OddsApiScore[]>>();
const CACHE_TTL_MS = 90_000;
const BACKOFF_STORAGE_KEY = 'odds_api_backoff_until';
let apiBackoffUntil = 0;
let backoffLoaded = false;
let lastApiWarning = '';

async function loadBackoff() {
  if (backoffLoaded) return;
  backoffLoaded = true;
  try {
    const stored = await AsyncStorage.getItem(BACKOFF_STORAGE_KEY);
    if (stored) {
      const ts = parseInt(stored, 10);
      if (!isNaN(ts) && ts > Date.now()) {
        apiBackoffUntil = ts;
      }
    }
  } catch { /* ignore */ }
}

function setBackoff(until: number) {
  apiBackoffUntil = until;
  AsyncStorage.setItem(BACKOFF_STORAGE_KEY, String(until)).catch(() => {});
}

function warnOnce(message: string) {
  if (lastApiWarning === message) return;
  lastApiWarning = message;
  console.warn(message);
}

function nextMonthResetDate(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

async function fetchScoresForSport(sportKey: string): Promise<OddsApiScore[]> {
  if (!ODDS_API_KEY) return [];

  await loadBackoff();

  const cached = scoreCache.get(sportKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;
  if (apiBackoffUntil > Date.now()) return cached?.data || [];
  const inFlight = inFlightRequests.get(sportKey);
  if (inFlight) return inFlight;

  const request = (async () => {
    try {
      const url = `${ODDS_API_BASE}/sports/${sportKey}/scores/?daysFrom=3&apiKey=${ODDS_API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) {
        let detail = '';
        try {
          const errorBody = await res.json();
          if (typeof errorBody?.error_code === 'string') detail = errorBody.error_code;
          else if (typeof errorBody?.message === 'string') detail = errorBody.message;
        } catch { /* ignore */ }

        const outOfCredits =
          res.status === 401 ||
          detail === 'OUT_OF_USAGE_CREDITS' ||
          detail.toLowerCase().includes('usage quota');

        if (outOfCredits) {
          const resetDay = nextMonthResetDate();
          setBackoff(Date.now() + 24 * 60 * 60 * 1000);
          warnOnce(
            `[MatchResults] The Odds API monthly credits are exhausted. ` +
            `Scores will use cached/fallback data until credits reset (${resetDay} at 12 AM UTC).`,
          );
        } else {
          setBackoff(Date.now() + 15 * 60 * 1000);
          warnOnce(`[MatchResults] The Odds API returned ${res.status} for ${sportKey}${detail ? ` (${detail})` : ''}.`);
        }
        return cached?.data || [];
      }
      const data: OddsApiScore[] = await res.json();
      lastApiWarning = '';
      scoreCache.set(sportKey, { data, fetchedAt: Date.now() });
      return data;
    } catch {
      setBackoff(Date.now() + 5 * 60 * 1000);
      warnOnce('[MatchResults] Failed to reach The Odds API; using cached and fallback result sources.');
      return cached?.data || [];
    } finally {
      inFlightRequests.delete(sportKey);
    }
  })();

  inFlightRequests.set(sportKey, request);
  return request;
}

function findMatchInScores(scores: OddsApiScore[], homeTeam: string, awayTeam: string): OddsApiScore | null {
  for (const score of scores) {
    const hm = teamsMatch(score.home_team, homeTeam) || teamsMatch(score.away_team, homeTeam);
    const am = teamsMatch(score.home_team, awayTeam) || teamsMatch(score.away_team, awayTeam);
    if (hm && am) return score;
  }
  for (const score of scores) {
    if (teamsMatch(score.home_team, homeTeam) && teamsMatch(score.away_team, awayTeam)) return score;
  }
  return null;
}

function getScoreValues(apiScore: OddsApiScore): { home: number; away: number } | null {
  if (!apiScore.scores || apiScore.scores.length < 2) return null;
  const homeEntry = apiScore.scores.find(s => s.name === apiScore.home_team);
  const awayEntry = apiScore.scores.find(s => s.name === apiScore.away_team);
  if (!homeEntry || !awayEntry) return null;
  const home = parseInt(homeEntry.score, 10);
  const away = parseInt(awayEntry.score, 10);
  if (isNaN(home) || isNaN(away)) return null;
  return { home, away };
}

export function resolvePickFromScore(
  selectionStr: string,
  homeScore: number,
  awayScore: number,
): 'won' | 'lost' | null {
  const sel = selectionStr.toLowerCase().trim();
  const total = homeScore + awayScore;

  if (/1x2|esito.*finale|match\s*result/i.test(sel)) {
    if (/:\s*1\b|home\s*win/i.test(sel)) return homeScore > awayScore ? 'won' : 'lost';
    if (/:\s*2\b|away\s*win/i.test(sel)) return awayScore > homeScore ? 'won' : 'lost';
    if (/:\s*x\b|draw|pareggio/i.test(sel)) return homeScore === awayScore ? 'won' : 'lost';
    if (/\b1\b\s*$/i.test(sel) || /pick.*\b1\b/i.test(sel)) return homeScore > awayScore ? 'won' : 'lost';
    if (/\b2\b\s*$/i.test(sel)) return awayScore > homeScore ? 'won' : 'lost';
  }

  if (/btts|goal.*no.*goal|entrambe/i.test(sel)) {
    const bothScored = homeScore > 0 && awayScore > 0;
    if (/:\s*(?:goal|yes|si|sì)\b/i.test(sel)) return bothScored ? 'won' : 'lost';
    if (/:\s*(?:no\s*goal|no)\b/i.test(sel)) return !bothScored ? 'won' : 'lost';
  }

  const ouMatch = sel.match(/(?:over|under)\s*(\d+(?:[.,]\d+)?)/i);
  if (ouMatch) {
    const line = parseFloat(ouMatch[1].replace(',', '.'));
    if (/over/i.test(sel)) return total > line ? 'won' : 'lost';
    if (/under/i.test(sel)) return total < line ? 'won' : 'lost';
  }

  return null;
}

function parseSportKeyFromEvent(eventStr: string, category: string): string | null {
  const parts = eventStr.split(' — ');
  const league = (parts.length >= 2 ? parts[0] : '').trim().toLowerCase();
  for (const [key, sportKey] of Object.entries(LEAGUE_TO_SPORT_KEY)) {
    if (league.includes(key) || key.includes(league)) return sportKey;
  }
  const prefixes = CATEGORY_TO_SPORT_PREFIX[category];
  if (prefixes?.length === 1 && !prefixes[0].endsWith('_')) return prefixes[0];
  if (category === 'Soccer') return 'soccer_italy_serie_a';
  return null;
}

function parseTeamsFromEvent(eventStr: string): { home: string; away: string } | null {
  const parts = eventStr.split(' — ');
  const matchPart = parts.length >= 2 ? parts[1] : parts[0];
  const vsMatch = matchPart.match(/(.+?)\s+(?:vs\.?|v\.?|[-–])\s+(.+)/i);
  if (vsMatch) return { home: vsMatch[1].trim(), away: vsMatch[2].trim() };
  return null;
}

export interface ResolveRequest {
  eventStr: string;
  selectionStr: string;
  category: string;
}

class MatchResultsService {
  async resolveAll(requests: ResolveRequest[]): Promise<Map<number, MatchResult>> {
    const results = new Map<number, MatchResult>();
    const sportGroups = new Map<string, { idx: number; req: ResolveRequest; teams: { home: string; away: string } }[]>();

    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      const teams = parseTeamsFromEvent(req.eventStr);
      if (!teams) continue;
      const sportKey = parseSportKeyFromEvent(req.eventStr, req.category);
      if (!sportKey) continue;
      const group = sportGroups.get(sportKey) || [];
      group.push({ idx: i, req, teams });
      sportGroups.set(sportKey, group);
    }

    for (const [sportKey, items] of sportGroups) {
      const scores = await fetchScoresForSport(sportKey);
      if (scores.length === 0) continue;

      for (const { idx, req, teams } of items) {
        const match = findMatchInScores(scores, teams.home, teams.away);
        if (!match) continue;

        const now = new Date();
        const commence = new Date(match.commence_time);
        const scoreVals = getScoreValues(match);

        let status: 'scheduled' | 'live' | 'completed';
        if (match.completed) status = 'completed';
        else if (commence <= now) status = 'live';
        else status = 'scheduled';

        let betOutcome: 'won' | 'lost' | null = null;
        if (status === 'completed' && scoreVals) {
          betOutcome = resolvePickFromScore(req.selectionStr, scoreVals.home, scoreVals.away);
        }

        results.set(idx, {
          status,
          homeTeam: match.home_team,
          awayTeam: match.away_team,
          homeScore: scoreVals?.home ?? null,
          awayScore: scoreVals?.away ?? null,
          commenceTime: match.commence_time,
          betOutcome,
        });
      }
    }

    return results;
  }

  clearCache() {
    scoreCache.clear();
    inFlightRequests.clear();
    apiBackoffUntil = 0;
    backoffLoaded = false;
    lastApiWarning = '';
    AsyncStorage.removeItem(BACKOFF_STORAGE_KEY).catch(() => {});
  }
}

export default new MatchResultsService();
