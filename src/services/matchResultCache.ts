import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@betra/finished_match_scores_v2';

export interface CachedMatchScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  finished: boolean;
  minutePlayed: number | null;
  savedAt: number;
}

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['`]/g, '')
    .replace(/\b(fc|cf|ac|as|ss|sc|us)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchCacheKey(home: string, away: string, date: string, league: string): string {
  const d = (date || '').trim().toLowerCase();
  const l = (league || '').trim().toLowerCase();
  return `${normalizeTeamName(home)}|${normalizeTeamName(away)}|${d}|${l}`;
}

let memoryCache: Record<string, CachedMatchScore> | null = null;

export async function loadMatchResultCache(): Promise<Record<string, CachedMatchScore>> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    memoryCache = raw ? JSON.parse(raw) : {};
    return memoryCache!;
  } catch {
    memoryCache = {};
    return memoryCache;
  }
}

export function peekMatchResultCache(): Record<string, CachedMatchScore> {
  return memoryCache || {};
}

export async function saveMatchResultEntries(entries: Record<string, CachedMatchScore>): Promise<void> {
  const prev = await loadMatchResultCache();
  const next = { ...prev };
  for (const [k, v] of Object.entries(entries)) {
    if (v.finished && v.homeScore >= 0 && v.awayScore >= 0) {
      next[k] = { ...v, savedAt: Date.now() };
    }
  }
  memoryCache = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[matchResultCache] save failed', e);
  }
}
