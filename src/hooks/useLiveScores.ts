import { useState, useEffect, useCallback } from 'react';
import liveScoresService, { LiveScore } from '../services/liveScoresService';
import { Bet } from '../types';

// Normalize team names for fuzzy matching
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Check if a bet title matches a live score event
function matchesBet(bet: Bet, score: LiveScore): boolean {
  const title = normalize(bet.title);
  const home = normalize(score.home_team);
  const away = normalize(score.away_team);

  // Direct team name match in title
  const homeMatch = title.includes(home) || home.includes(title.split(/\s+vs\.?\s+|\s+v\s+|\s+@\s+/)[0]?.trim() || '___');
  const awayMatch = title.includes(away) || away.includes(title.split(/\s+vs\.?\s+|\s+v\s+|\s+@\s+/)[1]?.trim() || '___');

  if (homeMatch && awayMatch) return true;

  // Try splitting bet title by common separators
  const separators = /\s+vs\.?\s+|\s+v\.?s\.?\s+|\s+versus\s+|\s+@\s+|\s+-\s+/i;
  const parts = bet.title.split(separators).map(normalize);
  if (parts.length >= 2) {
    const [teamA, teamB] = parts;
    // Check if both parts partially match home/away
    const aMatchesHome = home.includes(teamA) || teamA.includes(home);
    const aMatchesAway = away.includes(teamA) || teamA.includes(away);
    const bMatchesHome = home.includes(teamB) || teamB.includes(home);
    const bMatchesAway = away.includes(teamB) || teamB.includes(away);

    if ((aMatchesHome && bMatchesAway) || (aMatchesAway && bMatchesHome)) {
      return true;
    }
  }

  // Last resort: both team names appear somewhere in the title
  if (title.includes(home) && title.includes(away)) return true;

  return false;
}

export interface MatchedScore {
  score: LiveScore;
  display: string; // e.g. "Lakers 105 - 98 Warriors"
}

export function useLiveScores() {
  const [scores, setScores] = useState<LiveScore[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchScores = useCallback(async () => {
    try {
      const data = await liveScoresService.getAllRecentScores();
      setScores(data);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScores();

    // Subscribe to realtime changes
    const channel = liveScoresService.subscribeToScores((updated) => {
      setScores(updated);
    });

    // Poll every 60s as backup
    const interval = setInterval(fetchScores, 60000);

    return () => {
      channel.unsubscribe();
      clearInterval(interval);
    };
  }, [fetchScores]);

  // Match a single bet to a live score
  const matchBetToScore = useCallback((bet: Bet): MatchedScore | null => {
    for (const score of scores) {
      if (matchesBet(bet, score)) {
        const display = `${score.home_team} ${score.home_score} - ${score.away_score} ${score.away_team}`;
        return { score, display };
      }
    }
    return null;
  }, [scores]);

  return { scores, loading, matchBetToScore, refresh: fetchScores };
}
