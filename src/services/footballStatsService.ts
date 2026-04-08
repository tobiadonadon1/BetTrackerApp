/**
 * footballStatsService.ts
 *
 * Fetches detailed live match statistics from API-Football (api-football.com).
 * Used for Over/Under bets on: corners, cards, shots, fouls.
 *
 * Free tier: 100 requests/day, all endpoints available.
 */

import Constants from 'expo-constants';

const API_FOOTBALL_KEY =
  Constants.expoConfig?.extra?.apiFootballKey ||
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_FOOTBALL_KEY) ||
  '';

const BASE_URL = 'https://v3.football.api-sports.io';

export interface MatchStats {
  corners: { home: number; away: number; total: number };
  cards: { home: number; away: number; total: number };
  shotsOnTarget: { home: number; away: number; total: number };
  totalShots: { home: number; away: number; total: number };
  fouls: { home: number; away: number; total: number };
}

interface CacheEntry {
  data: MatchStats;
  timestamp: number;
}

class FootballStatsService {
  private cache = new Map<string, CacheEntry>();
  private CACHE_TTL = 1000 * 60 * 2; // 2 minutes — live stats refresh
  private MAX_CACHE_SIZE = 50; // Prevent unbounded growth

  /**
   * Try to find a live fixture matching the given team names, then fetch its statistics.
   * Returns null if: no API key, teams not found, or no live match.
   */
  async getMatchStats(homeTeam: string, awayTeam: string): Promise<MatchStats | null> {
    if (!API_FOOTBALL_KEY) {
      return null;
    }

    const cacheKey = `${homeTeam.toLowerCase()}_${awayTeam.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      // Step 1: Find the fixture by searching live matches
      const liveRes = await fetch(`${BASE_URL}/fixtures?live=all`, {
        headers: {
          'x-rapidapi-key': API_FOOTBALL_KEY,
          'x-rapidapi-host': 'v3.football.api-sports.io',
        },
      });

      if (!liveRes.ok) {
        console.warn('[FootballStats] Failed to fetch live fixtures:', liveRes.status);
        return null;
      }

      const liveData = await liveRes.json();
      const fixtures = liveData.response || [];

      // Find the fixture that matches these teams (fuzzy)
      const fixture = fixtures.find((f: any) => {
        const h = f.teams?.home?.name?.toLowerCase() || '';
        const a = f.teams?.away?.name?.toLowerCase() || '';
        const searchHome = homeTeam.toLowerCase();
        const searchAway = awayTeam.toLowerCase();

        return (
          (h.includes(searchHome) || searchHome.includes(h) ||
           a.includes(searchAway) || searchAway.includes(a)) &&
          (h.includes(searchHome) || a.includes(searchHome)) &&
          (h.includes(searchAway) || a.includes(searchAway))
        );
      });

      if (!fixture) {
        return null; // No live match found for these teams
      }

      const fixtureId = fixture.fixture.id;

      // Step 2: Fetch detailed statistics
      const statsRes = await fetch(`${BASE_URL}/fixtures/statistics?fixture=${fixtureId}`, {
        headers: {
          'x-rapidapi-key': API_FOOTBALL_KEY,
          'x-rapidapi-host': 'v3.football.api-sports.io',
        },
      });

      if (!statsRes.ok) {
        console.warn('[FootballStats] Failed to fetch fixture stats:', statsRes.status);
        return null;
      }

      const statsData = await statsRes.json();
      const teams = statsData.response || [];

      if (teams.length < 2) return null;

      const result = parseStatsResponse(teams);

      // Evict oldest entries if cache is full
      if (this.cache.size >= this.MAX_CACHE_SIZE) {
        const oldest = Array.from(this.cache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp)
          .slice(0, 10); // Remove 10 oldest
        for (const [key] of oldest) this.cache.delete(key);
      }

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.error('[FootballStats] Error:', error);
      return null;
    }
  }
}

/**
 * Parse the API-Football statistics response into our clean MatchStats shape.
 */
function parseStatsResponse(teams: any[]): MatchStats {
  const getStat = (teamIdx: number, statName: string): number => {
    const team = teams[teamIdx];
    if (!team?.statistics) return 0;
    const stat = team.statistics.find(
      (s: any) => s.type?.toLowerCase() === statName.toLowerCase()
    );
    return stat?.value ? parseInt(String(stat.value), 10) || 0 : 0;
  };

  const corners = {
    home: getStat(0, 'Corner Kicks'),
    away: getStat(1, 'Corner Kicks'),
    total: 0,
  };
  corners.total = corners.home + corners.away;

  // Cards: API-Football reports Yellow Cards and Red Cards separately
  const yellowHome = getStat(0, 'Yellow Cards');
  const yellowAway = getStat(1, 'Yellow Cards');
  const redHome = getStat(0, 'Red Cards');
  const redAway = getStat(1, 'Red Cards');
  const cards = {
    home: yellowHome + redHome,
    away: yellowAway + redAway,
    total: yellowHome + yellowAway + redHome + redAway,
  };

  const shotsOnTarget = {
    home: getStat(0, 'Shots on Goal'),
    away: getStat(1, 'Shots on Goal'),
    total: 0,
  };
  shotsOnTarget.total = shotsOnTarget.home + shotsOnTarget.away;

  const totalShots = {
    home: getStat(0, 'Total Shots'),
    away: getStat(1, 'Total Shots'),
    total: 0,
  };
  totalShots.total = totalShots.home + totalShots.away;

  const fouls = {
    home: getStat(0, 'Fouls'),
    away: getStat(1, 'Fouls'),
    total: 0,
  };
  fouls.total = fouls.home + fouls.away;

  return { corners, cards, shotsOnTarget, totalShots, fouls };
}

export default new FootballStatsService();
