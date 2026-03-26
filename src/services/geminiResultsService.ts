import { GEMINI_API_KEY, GEMINI_MODELS } from '../config/ocr';
import {
  loadMatchResultCache,
  saveMatchResultEntries,
  matchCacheKey,
  CachedMatchScore,
} from './matchResultCache';

export interface GeminiMatchResult {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  finished: boolean;
  minutePlayed: number | null;
}

export interface GeminiBatchRequest {
  key: string;
  home: string;
  away: string;
  date: string;
  league: string;
}

const inMemory = new Map<string, { data: GeminiMatchResult | null; fetchedAt: number }>();
const MEM_TTL_MS = 120_000;

function toGeminiResult(c: CachedMatchScore): GeminiMatchResult {
  return {
    homeTeam: c.homeTeam,
    awayTeam: c.awayTeam,
    homeScore: c.homeScore,
    awayScore: c.awayScore,
    finished: c.finished,
    minutePlayed: c.minutePlayed,
  };
}

async function callGemini(prompt: string): Promise<any> {
  if (!GEMINI_API_KEY) return null;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0, maxOutputTokens: 2048 },
        }),
      });

      if (res.status === 404) continue;
      if (!res.ok) {
        console.warn(`[GeminiResults] ${model} ${res.status}`);
        continue;
      }

      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      let text = '';
      for (const part of parts) {
        if (part.text) text += part.text;
      }
      if (!text) continue;

      const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) return JSON.parse(arrayMatch[0]);
      return JSON.parse(jsonStr);
    } catch (err) {
      console.warn(`[GeminiResults] ${model} failed:`, err);
      continue;
    }
  }
  return null;
}

function buildPrompt(matches: { home: string; away: string; date: string; league: string }[]): string {
  const year = new Date().getFullYear();
  const matchList = matches.map((m, i) => {
    let dateStr = m.date;
    if (dateStr && !dateStr.includes(String(year))) dateStr = `${dateStr} ${year}`;
    return `${i + 1}. ${m.home} vs ${m.away} (${m.league}, ${dateStr})`;
  }).join('\n');

  return `Search the web and find the FINAL SCORES for these matches (${year} season if applicable).

Return a JSON array only:
[{"index":1,"homeTeam":"A","awayTeam":"B","homeScore":2,"awayScore":1,"finished":true}]

If not played yet: homeScore -1, awayScore -1, finished false.

Matches:
${matchList}`;
}

class GeminiResultsService {
  /** Resolve from persistent + memory cache by match key (no network). */
  async hydrateFromDisk(requests: GeminiBatchRequest[]): Promise<Map<string, GeminiMatchResult>> {
    const out = new Map<string, GeminiMatchResult>();
    const disk = await loadMatchResultCache();

    for (const req of requests) {
      const mk = matchCacheKey(req.home, req.away, req.date, req.league);
      const row = disk[mk];
      if (row && row.finished && row.homeScore >= 0) {
        out.set(req.key, toGeminiResult(row));
      }
    }
    return out;
  }

  async fetchResults(requests: GeminiBatchRequest[]): Promise<Map<string, GeminiMatchResult>> {
    const results = new Map<string, GeminiMatchResult>();
    if (!GEMINI_API_KEY || requests.length === 0) return results;

    const disk = await loadMatchResultCache();
    const toFetch: GeminiBatchRequest[] = [];

    for (const req of requests) {
      const mk = matchCacheKey(req.home, req.away, req.date, req.league);
      const mem = inMemory.get(mk);
      if (mem && Date.now() - mem.fetchedAt < MEM_TTL_MS && mem.data && mem.data.homeScore >= 0) {
        results.set(req.key, mem.data);
        continue;
      }
      const row = disk[mk];
      if (row && row.finished && row.homeScore >= 0) {
        const g = toGeminiResult(row);
        results.set(req.key, g);
        inMemory.set(mk, { data: g, fetchedAt: Date.now() });
        continue;
      }
      toFetch.push(req);
    }

    if (toFetch.length === 0) return results;

    const CHUNK = 8;
    const persistBatch: Record<string, CachedMatchScore> = {};

    for (let start = 0; start < toFetch.length; start += CHUNK) {
      const chunk = toFetch.slice(start, start + CHUNK);
      const prompt = buildPrompt(chunk.map(c => ({ home: c.home, away: c.away, date: c.date, league: c.league })));

      try {
        const response = await callGemini(prompt);
        if (!Array.isArray(response)) continue;

        for (let ri = 0; ri < response.length; ri++) {
          const item = response[ri];
          let chunkIdx = ri;
          if (typeof item.index === 'number') chunkIdx = item.index >= 1 ? item.index - 1 : item.index;
          if (chunkIdx < 0 || chunkIdx >= chunk.length) chunkIdx = ri;
          const req = chunk[chunkIdx];
          if (!req) continue;

          if (item.homeScore === -1 && item.awayScore === -1) {
            inMemory.set(matchCacheKey(req.home, req.away, req.date, req.league), { data: null, fetchedAt: Date.now() });
            continue;
          }

          const result: GeminiMatchResult = {
            homeTeam: item.homeTeam || req.home,
            awayTeam: item.awayTeam || req.away,
            homeScore: typeof item.homeScore === 'number' ? item.homeScore : -1,
            awayScore: typeof item.awayScore === 'number' ? item.awayScore : -1,
            finished: !!item.finished,
            minutePlayed: typeof item.minutePlayed === 'number' ? item.minutePlayed : null,
          };

          const mk = matchCacheKey(req.home, req.away, req.date, req.league);
          inMemory.set(mk, { data: result, fetchedAt: Date.now() });
          results.set(req.key, result);

          if (result.finished && result.homeScore >= 0 && result.awayScore >= 0) {
            persistBatch[mk] = {
              homeTeam: result.homeTeam,
              awayTeam: result.awayTeam,
              homeScore: result.homeScore,
              awayScore: result.awayScore,
              finished: true,
              minutePlayed: result.minutePlayed,
              savedAt: Date.now(),
            };
          }
        }
      } catch (e) {
        console.warn('[GeminiResults] batch error', e);
      }
    }

    if (Object.keys(persistBatch).length > 0) {
      await saveMatchResultEntries(persistBatch);
    }

    return results;
  }
}

export default new GeminiResultsService();
