import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import matchResultsService, { MatchResult, ResolveRequest, resolvePickFromScore } from '../services/matchResultsService';
import geminiResultsService, { GeminiBatchRequest, GeminiMatchResult } from '../services/geminiResultsService';
import { loadMatchResultCache, matchCacheKey } from '../services/matchResultCache';
import { Bet } from '../types';
import { parseOverUnder, OverUnderInfo, StatType } from '../utils/overUnderParser';
import footballStatsService, { MatchStats } from '../services/footballStatsService';
import notificationService from '../services/notificationService';

export interface OverUnderProgress {
  currentValue: number;
  threshold: number;
  direction: 'over' | 'under';
  statType: StatType;
  isLive: boolean;
}

export interface FlatMatchInfo {
  matchResult: MatchResult | null;
  geminiResult: GeminiMatchResult | null;
  smartLabel: string;
  accent: string;
  bg: string;
  textColor: string;
  resolvedOutcome: 'won' | 'lost' | null;
  score: string | null;
  overUnderProgress: OverUnderProgress | null;
}

const COLORS = {
  won: { accent: '#4ADE80', bg: 'rgba(74,222,128,0.15)', text: '#4ADE80' },
  lost: { accent: '#EF4444', bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  void: { accent: '#6B8CAE', bg: 'rgba(107,140,174,0.15)', text: '#6B8CAE' },
  live: { accent: '#FBBF24', bg: 'rgba(251,191,36,0.15)', text: '#FBBF24' },
  scheduled: { accent: '#60A5FA', bg: 'rgba(96,165,250,0.12)', text: '#93C5FD' },
};

function parseEventDate(str: string): Date | null {
  if (!str) return null;
  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime()) && (str.includes('T') || str.match(/^\d{4}-\d{2}/))) return isoDate;
  const m = str.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*-?\s*(\d{1,2}):(\d{2})/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : new Date().getFullYear();
    return new Date(year, month, day, parseInt(m[4], 10), parseInt(m[5], 10));
  }
  return null;
}

function formatScheduledTime(d: Date): string {
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (isToday) return time;
  if (isTomorrow) return `Tom ${time}`;
  return `${d.getDate()}/${d.getMonth() + 1} ${time}`;
}

function estimateLiveMinute(startDate: Date): number {
  return Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 60000));
}

function parseEventParts(event: string) {
  const parts = event.split(' — ');
  if (parts.length >= 3) return { league: parts[0].trim(), matchTitle: parts[1].trim(), matchTime: parts[2].trim() };
  if (parts.length === 2) return { league: parts[0].trim(), matchTitle: parts[1].trim(), matchTime: '' };
  return { league: '', matchTitle: event.trim(), matchTime: '' };
}

function parseTeamsFromTitle(title: string): { home: string; away: string } | null {
  const vsMatch = title.match(/(.+?)\s+(?:vs\.?|v\.?|[-–])\s+(.+)/i);
  if (vsMatch) return { home: vsMatch[1].trim(), away: vsMatch[2].trim() };
  return null;
}

interface SelectionData {
  key: string;
  selStatus: string;
  eventStr: string;
  selectionStr: string;
  category: string;
  commenceTime: string;
  betDate: string;
  league: string;
  matchTitle: string;
}

function buildInfo(
  sel: SelectionData,
  oddsResult: MatchResult | null,
  geminiResult: GeminiMatchResult | null,
): FlatMatchInfo {
  if (sel.selStatus === 'won') {
    const score = geminiResult && geminiResult.homeScore >= 0
      ? `${geminiResult.homeScore}-${geminiResult.awayScore}` : null;
    return { matchResult: oddsResult, geminiResult, smartLabel: 'WON', ...COLORS.won, textColor: COLORS.won.text, resolvedOutcome: 'won', score, overUnderProgress: null };
  }
  if (sel.selStatus === 'lost') {
    const score = geminiResult && geminiResult.homeScore >= 0
      ? `${geminiResult.homeScore}-${geminiResult.awayScore}` : null;
    return { matchResult: oddsResult, geminiResult, smartLabel: 'LOST', ...COLORS.lost, textColor: COLORS.lost.text, resolvedOutcome: 'lost', score, overUnderProgress: null };
  }
  if (sel.selStatus === 'void') {
    return { matchResult: oddsResult, geminiResult, smartLabel: 'VOID', ...COLORS.void, textColor: COLORS.void.text, resolvedOutcome: null, score: null, overUnderProgress: null };
  }

  if (oddsResult) {
    if (oddsResult.status === 'completed' && oddsResult.betOutcome) {
      const score = oddsResult.homeScore !== null ? `${oddsResult.homeScore}-${oddsResult.awayScore}` : null;
      const c = oddsResult.betOutcome === 'won' ? COLORS.won : COLORS.lost;
      return {
        matchResult: oddsResult, geminiResult, smartLabel: oddsResult.betOutcome.toUpperCase(), ...c,
        textColor: c.text, resolvedOutcome: oddsResult.betOutcome, score, overUnderProgress: null,
      };
    }
    if (oddsResult.status === 'live') {
      const scoreStr = oddsResult.homeScore !== null ? `${oddsResult.homeScore}-${oddsResult.awayScore}` : null;
      const minute = Math.max(1, Math.floor((Date.now() - new Date(oddsResult.commenceTime).getTime()) / 60000));

      // Try to build Over/Under progress for live matches
      let ouProgress: OverUnderProgress | null = null;
      const ouInfo = parseOverUnder(sel.selectionStr);
      if (ouInfo && ouInfo.source === 'score' && oddsResult.homeScore !== null && oddsResult.awayScore !== null) {
        const currentTotal = oddsResult.homeScore + (oddsResult.awayScore ?? 0);
        ouProgress = {
          currentValue: currentTotal,
          threshold: ouInfo.threshold,
          direction: ouInfo.direction,
          statType: ouInfo.statType,
          isLive: true,
        };
      }

      return {
        matchResult: oddsResult, geminiResult, smartLabel: `MIN ${Math.min(minute, 90)}`, ...COLORS.live,
        textColor: COLORS.live.text, resolvedOutcome: null, score: scoreStr, overUnderProgress: ouProgress,
      };
    }
    if (oddsResult.status === 'scheduled') {
      const d = new Date(oddsResult.commenceTime);
      return {
        matchResult: oddsResult, geminiResult, smartLabel: formatScheduledTime(d), ...COLORS.scheduled,
        textColor: COLORS.scheduled.text, resolvedOutcome: null, score: null, overUnderProgress: null,
      };
    }
  }

  if (geminiResult && geminiResult.homeScore >= 0) {
    if (geminiResult.finished) {
      const outcome = resolvePickFromScore(sel.selectionStr, geminiResult.homeScore, geminiResult.awayScore, geminiResult.homeTeam, geminiResult.awayTeam);
      const score = `${geminiResult.homeScore}-${geminiResult.awayScore}`;
      if (outcome) {
        const c = outcome === 'won' ? COLORS.won : COLORS.lost;
        return { matchResult: oddsResult, geminiResult, smartLabel: outcome.toUpperCase(), ...c, textColor: c.text, resolvedOutcome: outcome, score, overUnderProgress: null };
      }
      return { matchResult: oddsResult, geminiResult, smartLabel: score, ...COLORS.scheduled, textColor: COLORS.scheduled.text, resolvedOutcome: null, score, overUnderProgress: null };
    }
    if (geminiResult.minutePlayed && geminiResult.minutePlayed > 0) {
      // Try to build Over/Under progress for live matches via Gemini data
      let ouProgress: OverUnderProgress | null = null;
      const ouInfo = parseOverUnder(sel.selectionStr);
      if (ouInfo && ouInfo.source === 'score' && geminiResult.homeScore >= 0) {
        const currentTotal = geminiResult.homeScore + geminiResult.awayScore;
        ouProgress = {
          currentValue: currentTotal,
          threshold: ouInfo.threshold,
          direction: ouInfo.direction,
          statType: ouInfo.statType,
          isLive: true,
        };
      }

      return {
        matchResult: oddsResult, geminiResult, smartLabel: `MIN ${geminiResult.minutePlayed}`, ...COLORS.live,
        textColor: COLORS.live.text, resolvedOutcome: null,
        score: `${geminiResult.homeScore}-${geminiResult.awayScore}`, overUnderProgress: ouProgress,
      };
    }
  }

  const eventDate = parseEventDate(sel.commenceTime);
  const betDate = sel.betDate ? new Date(sel.betDate) : null;
  const now = new Date();

  // Only use eventDate for scheduling if it's a REAL commence time from the event itself
  // NOT the bet insertion date — that would cause "MIN 1" immediately after placing a bet
  if (eventDate && !isNaN(eventDate.getTime())) {
    if (eventDate > now) {
      return {
        matchResult: null, geminiResult: null, smartLabel: formatScheduledTime(eventDate), ...COLORS.scheduled,
        textColor: COLORS.scheduled.text, resolvedOutcome: null, score: null, overUnderProgress: null,
      };
    }
    // Only show MIN X with a REAL commence time (not betDate), and only if
    // the match is plausibly still in progress (< 2.5 hours since kickoff)
    const hoursAgo = (now.getTime() - eventDate.getTime()) / 3600000;
    if (hoursAgo < 2.5) {
      const minute = estimateLiveMinute(eventDate);
      return {
        matchResult: null, geminiResult: null, smartLabel: `MIN ${Math.min(minute, 90)}`, ...COLORS.live,
        textColor: COLORS.live.text, resolvedOutcome: null, score: null, overUnderProgress: null,
      };
    }
  }

  // If betDate is in the FUTURE, show it as a scheduled event
  if (betDate && !isNaN(betDate.getTime()) && betDate > now) {
    return {
      matchResult: null, geminiResult: null, smartLabel: formatScheduledTime(betDate), ...COLORS.scheduled,
      textColor: COLORS.scheduled.text, resolvedOutcome: null, score: null, overUnderProgress: null,
    };
  }

  // No real data available — show pending indicator (NOT "MIN X" from bet date!)
  return {
    matchResult: null, geminiResult: null, smartLabel: '…', ...COLORS.scheduled, textColor: COLORS.scheduled.text,
    resolvedOutcome: null, score: null, overUnderProgress: null,
  };
}

function geminiReqFromSel(sel: SelectionData): GeminiBatchRequest | null {
  const teams = parseTeamsFromTitle(sel.matchTitle);
  if (!teams) return null;
  return {
    key: sel.key,
    home: teams.home,
    away: teams.away,
    date: sel.commenceTime || sel.betDate,
    league: sel.league,
  };
}

function buildMapFromSources(
  selectionData: SelectionData[],
  oddsResults: Map<number, MatchResult>,
  geminiByKey: Map<string, GeminiMatchResult>,
): Map<string, FlatMatchInfo> {
  const newMap = new Map<string, FlatMatchInfo>();
  for (let i = 0; i < selectionData.length; i++) {
    const sel = selectionData[i];
    const oddsResult = oddsResults.get(i) || null;
    const geminiResult = geminiByKey.get(sel.key) || null;
    newMap.set(sel.key, buildInfo(sel, oddsResult, geminiResult));
  }
  return newMap;
}

/** Build Gemini map from AsyncStorage only (instant path). */
function diskGeminiMap(selectionData: SelectionData[], disk: Record<string, import('../services/matchResultCache').CachedMatchScore>): Map<string, GeminiMatchResult> {
  const m = new Map<string, GeminiMatchResult>();
  for (const sel of selectionData) {
    if (sel.selStatus !== 'pending') continue;
    const teams = parseTeamsFromTitle(sel.matchTitle);
    if (!teams) continue;
    const mk = matchCacheKey(teams.home, teams.away, sel.commenceTime || sel.betDate, sel.league);
    const row = disk[mk];
    if (row && row.finished && row.homeScore >= 0) {
      m.set(sel.key, {
        homeTeam: row.homeTeam,
        awayTeam: row.awayTeam,
        homeScore: row.homeScore,
        awayScore: row.awayScore,
        finished: true,
        minutePlayed: row.minutePlayed,
      });
    }
  }
  return m;
}

export function useMatchResults(bets: Bet[]) {
  const [resultMap, setResultMap] = useState<Map<string, FlatMatchInfo>>(new Map());
  const [loading, setLoading] = useState(false);
  const selectionRef = useRef<SelectionData[]>([]);
  // Track previous scores to detect changes and fire notifications
  const prevScoresRef = useRef<Map<string, { home: number; away: number; finished: boolean }>>(new Map());

  const selectionData = useMemo<SelectionData[]>(() => {
    const items: SelectionData[] = [];
    for (const bet of bets) {
      if (!bet.selections?.length) continue;
      for (let i = 0; i < bet.selections.length; i++) {
        const s = bet.selections[i];
        const parsed = parseEventParts(s.event);
        items.push({
          key: `${bet.id}-${i}`,
          selStatus: s.status,
          eventStr: s.event,
          selectionStr: s.selection,
          category: s.category,
          commenceTime: parsed.matchTime,
          betDate: bet.date,
          league: parsed.league,
          matchTitle: parsed.matchTitle,
        });
      }
    }
    return items;
  }, [bets]);

  selectionRef.current = selectionData;

  const fetchResults = useCallback(async () => {
    const data = selectionRef.current;
    if (data.length === 0) {
      setResultMap(new Map());
      return;
    }
    setLoading(true);
    try {
      const disk = await loadMatchResultCache();
      const diskGemini = diskGeminiMap(data, disk);

      const oddsRequests: ResolveRequest[] = data.map(s => ({
        eventStr: s.eventStr,
        selectionStr: s.selectionStr,
        category: s.category,
      }));
      const oddsResults = await matchResultsService.resolveAll(oddsRequests);

      let geminiByKey = new Map<string, GeminiMatchResult>(diskGemini);
      const needGemini: GeminiBatchRequest[] = [];
      for (let i = 0; i < data.length; i++) {
        const sel = data[i];
        if (sel.selStatus !== 'pending') continue;
        const oddsResult = oddsResults.get(i);
        if (oddsResult?.status === 'completed' && oddsResult.betOutcome) continue;
        if (oddsResult?.status === 'live') continue;
        if (oddsResult?.status === 'scheduled') continue;
        if (geminiByKey.has(sel.key)) continue;
        const req = geminiReqFromSel(sel);
        if (req) needGemini.push(req);
      }
      if (needGemini.length > 0) {
        const fetched = await geminiResultsService.fetchResults(needGemini);
        for (const [k, v] of fetched) geminiByKey.set(k, v);
      }

      const newResultMap = buildMapFromSources(data, oddsResults, geminiByKey);

      // ── Score Change Detection → Fire Notifications ──
      try {
        for (const sel of data) {
          const info = newResultMap.get(sel.key);
          if (!info) continue;

          // Get score from either Gemini or Odds result
          const gemini = geminiByKey.get(sel.key);
          const oddsResult = oddsResults.get(data.indexOf(sel));
          const homeScore = gemini?.homeScore ?? (oddsResult?.homeScore ?? -1);
          const awayScore = gemini?.awayScore ?? (oddsResult?.awayScore ?? -1);
          const finished = gemini?.finished ?? (oddsResult?.status === 'completed');

          if (homeScore < 0 || awayScore < 0) continue;

          const prev = prevScoresRef.current.get(sel.key);
          const teams = parseTeamsFromTitle(sel.matchTitle);
          const matchLabel = teams ? `${teams.home} vs ${teams.away}` : sel.matchTitle;

          if (prev) {
            // Detect score change (goal!)
            if (prev.home !== homeScore || prev.away !== awayScore) {
              console.log(`[Notifications] Score change detected: ${matchLabel} ${prev.home}-${prev.away} → ${homeScore}-${awayScore}`);
              notificationService.sendGoalNotification(
                matchLabel,
                teams?.home || 'Home',
                teams?.away || 'Away',
                homeScore,
                awayScore,
                sel.key.split('-')[0], // betId
              );
            }
            // Detect match end
            if (!prev.finished && finished) {
              console.log(`[Notifications] Match ended: ${matchLabel} ${homeScore}-${awayScore}`);
              notificationService.sendMatchEndNotification(
                matchLabel,
                homeScore,
                awayScore,
                info.resolvedOutcome || 'pending',
                sel.key.split('-')[0],
              );
            }
          }

          // Update prev scores
          prevScoresRef.current.set(sel.key, { home: homeScore, away: awayScore, finished });
        }
      } catch (notifError) {
        console.warn('[useMatchResults] Notification error:', notifError);
      }

      setResultMap(newResultMap);
    } catch (e) {
      console.warn('[useMatchResults]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (selectionData.length === 0) {
        setResultMap(new Map());
        return;
      }
      const disk = await loadMatchResultCache();
      if (cancelled) return;
      const diskGemini = diskGeminiMap(selectionData, disk);
      setResultMap(buildMapFromSources(selectionData, new Map(), diskGemini));
      await fetchResults();
    })();
    return () => { cancelled = true; };
  }, [selectionData, fetchResults]);

  useEffect(() => {
    if (bets.length === 0) return;
    const id = setInterval(() => fetchResults(), 60_000);
    return () => clearInterval(id);
  }, [bets.length, fetchResults]);

  const getInfo = useCallback((betId: string, selIndex: number): FlatMatchInfo => {
    const key = `${betId}-${selIndex}`;
    return resultMap.get(key) || {
      matchResult: null,
      geminiResult: null,
      smartLabel: '…',
      ...COLORS.scheduled,
      textColor: COLORS.scheduled.text,
      resolvedOutcome: null,
      score: null,
      overUnderProgress: null,
    };
  }, [resultMap]);

  const refresh = useCallback(() => fetchResults(), [fetchResults]);

  return { getInfo, loading, refresh };
}
