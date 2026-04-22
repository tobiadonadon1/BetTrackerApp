import * as FileSystem from 'expo-file-system';
import {
  GOOGLE_VISION_API_KEY,
  GOOGLE_VISION_ENDPOINT,
  GEMINI_API_KEY,
  GEMINI_MODELS,
} from '../config/ocr';
// supabase import removed as OCR fallback is disabled
import { BetCategory, BetMarket } from '../types';

export interface OCRSelectionResult {
  event: string;
  selection: string;
  odds: number;
  category: BetCategory;
  market: BetMarket;
  league?: string;
  kickoff?: string;
}

export interface OCRExtractionResult {
  title: string;
  bookmaker: string;
  stake: number;
  odds: number;
  potentialWin: number;
  detectedLang: string;
  rawText: string;
  selections: OCRSelectionResult[];
  betType: 'single' | 'parlay';
  market: BetMarket;
  league?: string;
}

const LEAGUE_CATEGORY_RULES: Array<{ match: RegExp; league: string; category: BetCategory }> = [
  { match: /\b(nba|wnba)\b/i, league: 'NBA', category: 'NBA' },
  { match: /\b(nfl|ncaa football|college football)\b/i, league: 'NFL', category: 'NFL' },
  { match: /\b(mlb)\b/i, league: 'MLB', category: 'MLB' },
  { match: /\b(nhl)\b/i, league: 'NHL', category: 'NHL' },
  { match: /\b(premier league|champions league|serie a|la liga|bundesliga|ligue 1|mls|uefa|soccer|football)\b/i, league: 'Soccer', category: 'Soccer' },
  { match: /\b(atp|wta|tennis|grand slam)\b/i, league: 'Tennis', category: 'Tennis' },
  { match: /\b(ufc|mma)\b/i, league: 'UFC', category: 'UFC' },
  { match: /\b(boxing|boxe)\b/i, league: 'Boxing', category: 'Boxing' },
  { match: /\b(pga|golf|masters)\b/i, league: 'Golf', category: 'Golf' },
];

class OCRService {
  private inferLeagueAndCategory(...values: string[]): { league?: string; category: BetCategory } {
    const haystack = values.join(' ').trim();
    for (const rule of LEAGUE_CATEGORY_RULES) {
      if (rule.match.test(haystack)) {
        return { league: rule.league, category: rule.category };
      }
    }
    return { category: 'Other' };
  }

  private inferMarket(...values: string[]): BetMarket {
    const haystack = values.join(' ').toLowerCase();
    if (/(over|under|totals?|o\/u)/i.test(haystack)) return 'totals';
    if (/(spread|handicap|line|alt line)/i.test(haystack)) return 'spread';
    if (/([+-]\d+(?:[.,]\d+)?)\s*$/.test(haystack)) return 'spread';
    return 'moneyline';
  }

  private inferKickoff(...values: string[]): string | undefined {
    const haystack = values.join(' ');
    const match = haystack.match(
      /\b(\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?(?:\s+\d{1,2}:\d{2})?|\d{1,2}:\d{2}\s?(?:AM|PM)?)\b/i,
    );
    return match?.[1];
  }

  private buildEventLabel(event: string, league?: string, kickoff?: string): string {
    return [league, event, kickoff].filter(Boolean).join(' — ');
  }

  /**
   * Convert image URI to base64 — works on both native (expo-file-system) and web (fetch+blob)
   */
  async imageToBase64(imageUri: string): Promise<string> {
    try {
      // Web: expo-file-system doesn't work with blob: or data: URIs
      if (typeof window !== 'undefined' && (imageUri.startsWith('blob:') || imageUri.startsWith('data:'))) {
        console.log('[OCR] Using web-based base64 conversion for URI type:', imageUri.substring(0, 20));
        return await this.imageToBase64Web(imageUri);
      }

      // Native: use expo-file-system (most reliable for file:// URIs on iOS/Android)
      console.log('[OCR] Using FileSystem base64 conversion for URI type:', imageUri.substring(0, 20));
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: 'base64' as any,
      });
      return base64;
    } catch (error: any) {
      console.error('[OCR] Error converting image to base64:', error);
      // Fallback: try web method if native fails (e.g., unusual URI scheme)
      try {
        console.log('[OCR] Native base64 failed, trying web fallback...');
        return await this.imageToBase64Web(imageUri);
      } catch (fallbackError) {
        console.error('[OCR] Web fallback also failed:', fallbackError);
        throw new Error(`Failed to process image: ${error.message || 'unknown error'}`);
      }
    }
  }

  /**
   * Web-compatible base64 conversion using fetch + FileReader
   */
  private async imageToBase64Web(imageUri: string): Promise<string> {
    // Handle data: URIs directly
    if (imageUri.startsWith('data:')) {
      const base64Part = imageUri.split(',')[1];
      if (base64Part) return base64Part;
    }

    // Fetch the blob and convert
    const response = await fetch(imageUri);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Strip data:image/...;base64, prefix
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('FileReader failed to convert image'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Extract bet data from image.
   *
   * Three-layer strategy (best → worst):
   *   1. Gemini Vision — send the raw image to Gemini 2.5; it sees the ticket's
   *      spatial layout, which is what disambiguates stake-vs-potentialWin and
   *      keeps per-leg odds aligned to their legs.
   *   2. Google Vision OCR → Gemini text parse — text-only fallback for when
   *      Gemini Vision is unavailable/returns a weak result.
   *   3. Google Vision OCR → regex — last-resort structured parser.
   */
  async extractBetData(imageUri: string, isBase64: boolean = false): Promise<OCRExtractionResult> {
    console.log('[OCR] extractBetData called. Vision key:', !!GOOGLE_VISION_API_KEY, 'Gemini key:', !!GEMINI_API_KEY, 'isBase64:', isBase64);

    let base64Image = isBase64 ? imageUri : await this.imageToBase64(imageUri);
    if (base64Image.includes('base64,')) {
      base64Image = base64Image.split('base64,')[1];
    }

    // ── Layer 1: Gemini Vision (primary) ──────────────────────────────
    let result: OCRExtractionResult | null = null;
    if (GEMINI_API_KEY) {
      try {
        result = await this.extractWithGeminiVision(base64Image);
        if (result && this.resultIsUsable(result)) {
          console.log('[OCR] Gemini Vision extraction succeeded.');
          this.logParsed(result, 'gemini-vision');
          return result;
        }
        console.log('[OCR] Gemini Vision returned weak result — falling back.');
      } catch (e) {
        console.warn('[OCR] Gemini Vision threw, falling back:', e);
      }
    }

    // ── Layer 2+3: Google Vision text, then Gemini-text or regex ──────
    if (!GOOGLE_VISION_API_KEY) {
      if (result) return result; // keep whatever Gemini Vision gave us
      throw new Error('OCR is not configured. The Google Vision API key is missing from this build. Please rebuild the app.');
    }

    const text = await this.callGoogleVision(base64Image);
    if (!text || text.trim().length === 0) {
      throw new Error('No text detected in image. Please ensure the bet ticket is clearly visible and well-lit.');
    }
    console.log('[OCR] Vision text (first 500 chars):', text.substring(0, 500));

    // Layer 2: Gemini text parse
    let textResult: OCRExtractionResult | null = null;
    try {
      textResult = await this.extractStructuredWithGemini(text);
    } catch (e) {
      console.warn('[OCR] Gemini text extraction threw:', e);
    }

    if (textResult && this.resultIsUsable(textResult)) {
      this.logParsed(textResult, 'gemini-text');
      return textResult;
    }

    // Layer 3: regex
    console.log('[OCR] Falling through to regex parser');
    const regexResult = this.parseBetData(text);
    this.logParsed(regexResult, 'regex');
    if (!regexResult.title && regexResult.selections.length === 0) {
      throw new Error('Could not identify any bets in this image. Try a clearer photo or enter manually.');
    }
    return regexResult;
  }

  /** Is a parsed result strong enough to ship to the review screen? */
  private resultIsUsable(r: OCRExtractionResult): boolean {
    return r.selections.length > 0 || r.stake > 0 || r.potentialWin > 0;
  }

  private logParsed(r: OCRExtractionResult, source: string) {
    console.log(`[OCR] (${source})`, JSON.stringify({
      title: r.title, bookmaker: r.bookmaker, stake: r.stake, odds: r.odds,
      potentialWin: r.potentialWin, league: r.league,
      selectionsCount: r.selections.length,
      selections: r.selections.map(s => ({
        event: s.event, selection: s.selection, odds: s.odds, kickoff: s.kickoff,
      })),
    }, null, 2));
  }

  /**
   * Send the raw ticket image to Gemini for end-to-end extraction.
   * Gemini sees the spatial layout (columns, alignment, "STAKE" vs "WIN"
   * labels), which dramatically improves accuracy vs text-only OCR.
   */
  private async extractWithGeminiVision(base64Image: string): Promise<OCRExtractionResult | null> {
    if (!GEMINI_API_KEY) return null;

    const prompt = `You are reading a photograph of a sports betting ticket (slip). Languages: English, Italian, Spanish, French, German. Return ONLY a JSON object — no prose, no markdown fences.

FIVE CRITICAL FIELDS (these are the ones the user cares about most):
  1. bookmaker  — sportsbook name (Sisal, Snai, Goldbet, Lottomatica, Better, Eplay24, Eurobet, DomusBet, Bet365, DraftKings, FanDuel, William Hill, Betfair, Pinnacle, BetMGM, Caesars, PointsBet, Betway, Unibet, Betsson, Bwin, Skybet, Novibet, Betflag, Betclic, etc.). Read from the logo or header. Use "Unknown" only if truly absent.
  2. event       — each leg's match: "Inter vs Juventus", "Lakers vs Warriors". Use " vs " as separator.
  3. selection   — the specific pick for each leg, verbatim as on the ticket: "Over 2.5", "Under 3.5", "1X2: 1", "Gol/NoGol: Gol", "Doppia Chance: 1X", "Handicap -1.5", "BTTS: Yes", "Draw No Bet: 1", exact score "2-1", etc.
  4. stake       — amount the user wagered. Labels: "Importo", "Puntata", "Giocata", "Stake", "Mise", "Einsatz", "Apuesta". Usually the smaller monetary value on the slip.
  5. odds        — total decimal odds AND per-leg decimal odds. Labels: "Quota Totale", "Quota", "Total Odds", "Cote". European decimals use comma — convert "1,85" → 1.85, "10,00" → 10.

Schema:
{
  "bookmaker": string,
  "stake": number,
  "potentialWin": number,
  "totalOdds": number,
  "league": string|null,
  "kickoff": string|null,
  "selections": [
    {
      "event": string,
      "selection": string,
      "odds": number,
      "league": string|null,
      "kickoff": string|null,
      "market": "moneyline" | "spread" | "totals" | "other"
    }
  ]
}

Rules (follow strictly):
- Convert every European decimal to a dot: "1,85" → 1.85.
- Strip currency symbols from numeric fields.
- Never invent values. Use 0 / null / "Unknown" if not visible on the ticket.
- Stake is almost always SMALLER than potentialWin. If you're unsure which is which, pick the smaller monetary value as stake.
- Rough sanity: stake × totalOdds ≈ potentialWin (within a few percent). Use this to resolve ambiguity.
- For combo/multipla tickets: EVERY leg must appear in "selections". Italian tickets usually list league → date/time → home team → away team → market: selection → odds, one leg per block.
- For kickoff: return ISO-ish "YYYY-MM-DD HH:MM" when possible; otherwise the date/time string as printed.
- "market": "totals" for Over/Under, "spread" for Handicap/Spread, "moneyline" for 1X2 / Match Result / Winner, "other" for Gol/NoGol / BTTS / Doppia Chance / exotic markets.

Return only the JSON object.`;

    for (const model of GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
              ],
            }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          }),
        });
        if (res.status === 404) continue;
        if (!res.ok) {
          console.warn(`[OCR/GeminiVision] ${model} HTTP ${res.status}`);
          continue;
        }
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        let out = '';
        for (const p of parts) if (p.text) out += p.text;
        if (!out) continue;
        const clean = out.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;
        const parsed = JSON.parse(jsonMatch[0]);
        return this.normalizeGeminiResult(parsed, '');
      } catch (err) {
        console.warn(`[OCR/GeminiVision] ${model} failed:`, err);
        continue;
      }
    }
    return null;
  }

  /**
   * Ask Gemini to parse the raw OCR text into a structured OCRExtractionResult.
   * Returns null on any failure (missing key, network error, non-JSON, etc.) so
   * the caller can fall back to the regex parser.
   */
  private async extractStructuredWithGemini(rawText: string): Promise<OCRExtractionResult | null> {
    if (!GEMINI_API_KEY) return null;

    const prompt = `You extract structured data from the OCR of a sports betting ticket (Italian, English, Spanish, French or German). Return JSON only — no markdown fences, no prose.

Schema:
{
  "bookmaker": string,        // e.g. "Sisal", "Bet365", "Snai", "Lottomatica", "Goldbet", "Better". Use "Unknown" if not identifiable.
  "stake": number,            // the amount wagered ("Importo", "Puntata", "Giocata", "Stake", "Mise", "Einsatz", "Apuesta"). 0 if unknown.
  "potentialWin": number,     // potential winnings ("Vincita Potenziale", "Vincita Pot.", "Potenziale Vincita", "Potential Win", "To Win", "Returns", "Gewinn", "Ganancia"). 0 if unknown.
  "totalOdds": number,        // total decimal odds ("Quota Totale", "Quota", "Total Odds"). 0 if unknown.
  "league": string|null,      // primary league/competition if detectable, else null.
  "selections": [
    {
      "event": string,        // the match, e.g. "Inter vs Juventus".
      "selection": string,    // the pick, e.g. "Over 2.5", "Gol/NoGol: Gol", "1X2: 1", "Handicap -1", "BTTS: Yes".
      "odds": number,         // decimal odds for this leg. 0 if unknown.
      "league": string|null,  // league for this leg if detectable, else null.
      "market": "moneyline" | "spread" | "totals" | "other"
    }
  ]
}

Strict rules:
- Convert European decimals to dots ("1,85" → 1.85, "10,00" → 10).
- Strip currency symbols from numeric fields.
- Do NOT invent values. Use 0 / null / "Unknown" when not present in the text.
- The stake is usually the smaller monetary value; the potential win is usually the larger one.
- For combo/multipla tickets, list EVERY leg in "selections".
- "market" values: "totals" for Over/Under, "spread" for Handicap/Spread, "moneyline" for 1X2/Winner, "other" for Gol/NoGol/BTTS/other exotic markets.

OCR text:
---
${rawText}
---

Return only the JSON object.`;

    for (const model of GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 2048,
              responseMimeType: 'application/json',
            },
          }),
        });

        if (res.status === 404) continue;
        if (!res.ok) {
          console.warn(`[OCR/Gemini] ${model} HTTP ${res.status}`);
          continue;
        }

        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        let out = '';
        for (const p of parts) if (p.text) out += p.text;
        if (!out) continue;

        const clean = out.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const parsed = JSON.parse(jsonMatch[0]);
        return this.normalizeGeminiResult(parsed, rawText);
      } catch (err) {
        console.warn(`[OCR/Gemini] ${model} failed:`, err);
        continue;
      }
    }
    return null;
  }

  /**
   * Convert a Gemini JSON response into a validated OCRExtractionResult.
   * Enriches with league/category/market inference when Gemini left gaps.
   */
  private normalizeGeminiResult(g: any, rawText: string): OCRExtractionResult {
    const toNumber = (v: any): number => {
      if (typeof v === 'number' && isFinite(v)) return v;
      if (typeof v === 'string') {
        const n = parseFloat(v.replace(',', '.').replace(/[^\d.]/g, ''));
        return isFinite(n) ? n : 0;
      }
      return 0;
    };

    const rawSelections = Array.isArray(g?.selections) ? g.selections : [];
    const selections: OCRSelectionResult[] = rawSelections
      .map((s: any) => {
        const event = String(s?.event ?? '').trim();
        const selection = String(s?.selection ?? '').trim();
        const odds = toNumber(s?.odds);
        const legLeagueHint = s?.league ? String(s.league).trim() : '';
        const legLeague = legLeagueHint || undefined;
        const leagueData = legLeague
          ? { league: legLeague, category: this.inferLeagueAndCategory(legLeague, event, selection).category }
          : this.inferLeagueAndCategory(event, selection);
        const marketAllowed = ['moneyline', 'spread', 'totals', 'other'];
        const market: BetMarket = marketAllowed.includes(s?.market)
          ? (s.market as BetMarket)
          : this.inferMarket(selection, event);
        // Prefer Gemini's explicit kickoff field; fall back to regex on event+selection,
        // then to the ticket-level kickoff when the per-leg field is empty.
        const geminiKickoff = typeof s?.kickoff === 'string' ? s.kickoff.trim() : '';
        const topKickoff = typeof g?.kickoff === 'string' ? g.kickoff.trim() : '';
        const kickoff = geminiKickoff
          || this.inferKickoff(event, selection)
          || topKickoff
          || undefined;
        return {
          event,
          selection,
          odds,
          category: leagueData.category,
          market,
          league: legLeague || leagueData.league,
          kickoff,
        };
      })
      .filter((s: OCRSelectionResult) => s.event || s.selection);

    let totalOdds = toNumber(g?.totalOdds);
    if (!totalOdds && selections.length) {
      const valid = selections.filter(s => s.odds > 0);
      totalOdds = valid.length
        ? valid.reduce((acc, s) => acc * s.odds, 1)
        : 0;
      if (totalOdds === 1) totalOdds = 0;
    }

    const bookmakerRaw = typeof g?.bookmaker === 'string' ? g.bookmaker.trim() : '';
    const bookmaker = bookmakerRaw && bookmakerRaw.toLowerCase() !== 'unknown'
      ? bookmakerRaw.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : 'Unknown';

    const title = selections.length > 1
      ? `Parlay (${selections.length} legs)`
      : (selections[0]?.event || 'Scanned Bet');

    const aggregatedLeagues = new Set<string>();
    if (typeof g?.league === 'string' && g.league.trim()) aggregatedLeagues.add(g.league.trim());
    selections.forEach(s => { if (s.league) aggregatedLeagues.add(s.league); });
    const aggregatedLeague = aggregatedLeagues.size > 1
      ? Array.from(aggregatedLeagues).join(', ')
      : aggregatedLeagues.size === 1
        ? Array.from(aggregatedLeagues)[0]
        : undefined;

    return {
      title,
      bookmaker,
      stake: toNumber(g?.stake),
      odds: Number(totalOdds.toFixed(2)),
      potentialWin: Number(toNumber(g?.potentialWin).toFixed(2)),
      detectedLang: this.detectLanguage(rawText),
      rawText,
      selections,
      betType: selections.length > 1 ? 'parlay' : 'single',
      market: selections[0]?.market || this.inferMarket(rawText),
      league: aggregatedLeague,
    };
  }

  /**
   * Call Google Vision API directly
   */
  private async callGoogleVision(base64Image: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${GOOGLE_VISION_ENDPOINT}?key=${GOOGLE_VISION_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
          }],
        }),
      });
    } catch (fetchError: any) {
      throw new Error(`Network error connecting to Google Vision: ${fetchError.message || 'check your internet connection'}`);
    }

    if (!response.ok) {
      let detail = '';
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || JSON.stringify(errBody).substring(0, 200);
      } catch {
        detail = `HTTP ${response.status}`;
      }
      console.error(`[Vision API Error] HTTP ${response.status}: ${detail}`);
      throw new Error(`Vision API Error: ${detail}`);
    }

    const data = await response.json();

    // Check for API-level errors in the response body
    const apiError = data.responses?.[0]?.error;
    if (apiError) {
      console.error(`[Vision API Error in Response]: ${apiError.message || 'unknown error'}`);
      throw new Error(`Vision API Error: ${apiError.message || 'unknown error'}`);
    }

    const text = data.responses?.[0]?.fullTextAnnotation?.text || '';
    if (!text) {
      throw new Error('No text found in image. The image may be too blurry, dark, or not contain readable text.');
    }
    return text;
  }

  /**
   * Parse extracted text to bet data, detecting multiple legs if present.
   * Supports Italian (Lottomatica, Sisal, SNAI, Goldbet, Eurobet, Better),
   * English, and European slip formats.
   */
  parseBetData(text: string): OCRExtractionResult {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const fullText = text.toLowerCase();
    const detectedLang = this.detectLanguage(text);

    // ── BOOKMAKER ──
    const bookmakerKeywords = [
      'bet365', 'draftkings', 'fanduel', 'william hill', 'betfair',
      'pinnacle', 'betmgm', 'caesars', 'pointsbet', 'betway',
      'unibet', 'betsson', 'bwin', 'ladbrokes', 'coral',
      'paddy power', 'pokerstars', 'stake', 'marathon', 'snai',
      'sisal', 'eurobet', 'goldbet', 'lottomatica', 'betclic',
      'sportingbet', 'bovada', 'betonline', '888sport', 'skybet',
      'better', 'eplay24', 'domusbet', 'betflag', 'novibet',
    ];
    let bookmaker = 'Unknown';
    for (const keyword of bookmakerKeywords) {
      if (fullText.includes(keyword)) {
        bookmaker = keyword.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        break;
      }
    }

    // ── STAKE (IMPORTO / PUNTATA) ──
    let stake = 0;
    const stakePatterns = [
      /(?:importo|puntata|stake|mise|einsatz|amount)[:\s]*(\d+[.,]?\d*)\s*[€$£]?/i,
      /(?:importo|puntata|stake|mise|einsatz|amount)[:\s]*[€$£]?\s*(\d+[.,]?\d*)/i,
      /(\d+[.,]\d+)\s*€/,
      /€\s*(\d+[.,]\d+)/,
      /[$€£]\s*(\d+[.,]?\d+)/,
      /(?:total\s*(?:stake|bet)?)[:\s]*[$€£]?\s*(\d+[.,]?\d*)/i,
    ];
    for (const pattern of stakePatterns) {
      const match = text.match(pattern);
      if (match) {
        const val = parseFloat(match[1].replace(',', '.'));
        // Avoid picking up the potential win as stake — stake is usually the smaller number
        if (val > 0 && val < 10000) { stake = val; break; }
      }
    }

    // ── POTENTIAL WIN (VINCITA POT.) ──
    let extractedPotentialWin = 0;
    // Strategy 1: regex on full text (handles same-line)
    const potWinPatterns = [
      /vincita\s*pot[.\s]*(\d+[.,]?\d*)/i,
      /vincita\s*pot[.\s]*[€$£]?\s*(\d+[.,]?\d*)/i,
      /(?:potential\s*win|to\s*win|returns?)[.:\s]*[$€£]?\s*(\d+[.,]?\d*)/i,
    ];
    for (const pattern of potWinPatterns) {
      const match = text.match(pattern);
      if (match) {
        const val = parseFloat(match[1].replace(',', '.'));
        if (val > 0) { extractedPotentialWin = val; break; }
      }
    }
    // Strategy 2: line-by-line search (handles multi-line OCR)
    if (extractedPotentialWin === 0) {
      for (let li = 0; li < lines.length; li++) {
        if (/vincita/i.test(lines[li])) {
          // Try to find number on this line
          const numOnLine = lines[li].match(/(\d+[.,]\d+)/);
          if (numOnLine) {
            const val = parseFloat(numOnLine[1].replace(',', '.'));
            if (val > stake) { extractedPotentialWin = val; break; }
          }
          // Try next line
          if (li + 1 < lines.length) {
            const numOnNext = lines[li + 1].match(/(\d+[.,]\d+)/);
            if (numOnNext) {
              const val = parseFloat(numOnNext[1].replace(',', '.'));
              if (val > stake) { extractedPotentialWin = val; break; }
            }
          }
        }
      }
    }
    // Strategy 3: find the largest monetary value in the text as potential win
    if (extractedPotentialWin === 0) {
      const allMoneyValues: number[] = [];
      const moneyRegex = /(\d+[.,]\d+)\s*[€$£]/g;
      let mm;
      while ((mm = moneyRegex.exec(text)) !== null) {
        allMoneyValues.push(parseFloat(mm[1].replace(',', '.')));
      }
      if (allMoneyValues.length > 0) {
        const largest = Math.max(...allMoneyValues);
        if (largest > stake) extractedPotentialWin = largest;
      }
    }

    // ── KNOWN LEAGUES for block detection ──
    const leagueKeywords = [
      'serie a', 'serie b', 'premier league', 'la liga', 'liga', 'bundesliga',
      'ligue 1', 'ligue 2', 'eredivisie', 'primeira liga', 'süper lig',
      'champions league', 'europa league', 'conference league',
      'coppa italia', 'fa cup', 'carabao cup', 'copa del rey',
      'mls', 'nba', 'nfl', 'nhl', 'mlb', 'atp', 'wta',
      'calcio', 'football', 'soccer', 'tennis', 'basket',
      'uefa', 'fifa', 'concacaf', 'conmebol',
      'jupiler', 'scottish', 'championship', 'league one', 'league two',
      'super league', 'ekstraklasa', 'allsvenskan',
    ];

    // ── MARKET keywords (Italian + English) ──
    const marketLinePattern = /^(gol\s*\/?\s*no\s*gol|esito\s*finale\s*1x2|under|over|ht\/ft|handicap|dnb|doppia\s*chance|both\s*teams|btts|team\d?\s*vince|draw\s*no\s*bet|result|spread|totals?|moneyline|1x2)/i;

    // Helper: is this line a league header?
    const isLeagueLine = (line: string): boolean => {
      // Strip OCR artifacts (flag emojis → '+', special chars) before checking
      const lower = line.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      return leagueKeywords.some(lk => lower.includes(lk));
    };

    // Helper: is this line a date/time line or contains a date?
    const datePattern = /\d{1,2}\s+(?:jan|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|may|jun|jul|aug|sep|oct|dec)\w*\s+\d{4}/i;
    const timePattern = /\d{1,2}:\d{2}/;

    // Helper: is this line likely a team name?
    const isTeamLine = (line: string): boolean => {
      if (line.length < 2 || line.length > 40) return false;
      if (/^\d+[.,]\d+$/.test(line)) return false; // pure odds
      if (/^[€$£\d.,\s]+$/.test(line)) return false; // pure money
      if (/^(multipla|singola|sistema|importo|vincita|puntata|data|prenotazione|codice|barcode|re\d)/i.test(line)) return false;
      if (marketLinePattern.test(line)) return false;
      if (isLeagueLine(line)) return false;
      if (datePattern.test(line)) return false;
      // Must have at least one letter
      if (!/[a-zA-ZàèéìòùÀÈÉÌÒÙ]/.test(line)) return false;
      return true;
    };

    // Helper: extract market + selection + odds from a line like "Gol/NoGol : Gol  1.75"
    const parseMarketLine = (line: string): { market: string; selection: string; odds: number } | null => {
      // Pattern: "Market : Selection   Odds"
      const match = line.match(/^(.+?)\s*:\s*(.+?)\s+(\d+[.,]\d+)\s*$/);
      if (match) {
        return {
          market: match[1].trim(),
          selection: match[2].trim(),
          odds: parseFloat(match[3].replace(',', '.')),
        };
      }
      // Pattern: "Market : Selection" (odds on next line or missing)
      const matchNoOdds = line.match(/^(.+?)\s*:\s*(.+)$/);
      if (matchNoOdds && marketLinePattern.test(matchNoOdds[1].trim())) {
        // Check if the selection part ends with odds
        const selPart = matchNoOdds[2].trim();
        const oddsAtEnd = selPart.match(/^(.+?)\s+(\d+[.,]\d+)$/);
        if (oddsAtEnd) {
          return {
            market: matchNoOdds[1].trim(),
            selection: oddsAtEnd[1].trim(),
            odds: parseFloat(oddsAtEnd[2].replace(',', '.')),
          };
        }
        return {
          market: matchNoOdds[1].trim(),
          selection: selPart,
          odds: 0,
        };
      }
      return null;
    };

    // ── ITALIAN BLOCK PARSER ──
    // Detect legs in format: [League] [Date] / Team1 / Team2 / Market:Selection Odds
    const selections: OCRSelectionResult[] = [];
    const foundLeagues = new Set<string>();
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Check if this line starts a leg block (league header OR team name followed by another team)
      let league: string | undefined;
      let kickoff: string | undefined;
      let startIdx = i;

      // Try: League line (possibly with date on same line or next line)
      if (isLeagueLine(line)) {
        league = line.replace(datePattern, '').replace(timePattern, '').trim();
        // Strip flag emojis, special chars, leading "+", and other OCR artifacts
        league = league.replace(/[🏴🇮🇹🇬🇧🇪🇸🇩🇪🇫🇷🇳🇱🇵🇹🇧🇪🇹🇷🇳🇴🇸🇪🇦🇹🇨🇭⚽🏀🏈🎾⏱⏰🕐]/gu, '').trim();
        league = league.replace(/^[\s\-–—:+*•]+|[\s\-–—:+*•]+$/g, '').trim();
        // Normalize: capitalize first letter of each word
        if (league) {
          league = league.toUpperCase();
          foundLeagues.add(league);
        }

        const dateMatch = line.match(datePattern);
        const timeMatch = line.match(timePattern);
        if (dateMatch) kickoff = dateMatch[0] + (timeMatch ? ' ' + timeMatch[0] : '');

        i++;
        // Skip any standalone date line right after league
        if (i < lines.length && datePattern.test(lines[i]) && !isTeamLine(lines[i])) {
          kickoff = lines[i].match(datePattern)?.[0];
          i++;
        }
      }

      // Now look for Team1 + Team2
      if (i < lines.length && isTeamLine(lines[i])) {
        const team1 = lines[i].trim();
        i++;

        if (i < lines.length && isTeamLine(lines[i])) {
          const team2 = lines[i].trim();
          i++;

          // Now look for market/selection/odds line(s)
          let marketData: { market: string; selection: string; odds: number } | null = null;

          // Try multiple lines after team2 for market+odds
          const scanLimit = Math.min(i + 4, lines.length);
          for (let j = i; j < scanLimit; j++) {
            // Skip empty or date-only lines
            if (datePattern.test(lines[j]) && !isTeamLine(lines[j])) continue;
            // If we hit what looks like a new league or new team pair, stop
            if (j > i && (isLeagueLine(lines[j]) || (isTeamLine(lines[j]) && j + 1 < lines.length && isTeamLine(lines[j + 1])))) break;

            marketData = parseMarketLine(lines[j]);
            if (marketData) {
              i = j + 1;
              // If market matched but odds = 0, aggressively search next lines for odds
              if (marketData.odds === 0) {
                for (let k = i; k < Math.min(i + 3, lines.length); k++) {
                  // Stop if we hit a new block
                  if (isLeagueLine(lines[k]) || (isTeamLine(lines[k]) && k + 1 < lines.length && isTeamLine(lines[k + 1]))) break;
                  // Extract any decimal number from the line
                  const oddsInLine = lines[k].match(/(\d+[.,]\d{1,2})/);
                  if (oddsInLine) {
                    const val = parseFloat(oddsInLine[1].replace(',', '.'));
                    if (val > 1.01 && val < 100) {
                      marketData.odds = val;
                      i = k + 1;
                      break;
                    }
                  }
                }
              }
              break;
            }

            // Try: line contains any decimal number that looks like odds
            const anyOdds = lines[j].match(/(\d+[.,]\d{1,2})/);
            if (anyOdds) {
              const val = parseFloat(anyOdds[1].replace(',', '.'));
              if (val > 1.01 && val < 100) {
                // Check if there's also market info on this line
                const beforeOdds = lines[j].substring(0, lines[j].indexOf(anyOdds[0])).trim();
                marketData = {
                  market: beforeOdds || 'moneyline',
                  selection: beforeOdds || team1,
                  odds: val,
                };
                i = j + 1;
                break;
              }
            }
          }

          const event = `${team1} vs ${team2}`;
          const leagueData = league
            ? { league, category: this.inferLeagueAndCategory(league, event).category }
            : this.inferLeagueAndCategory(event, team1, team2);

          if (league) foundLeagues.add(league);

          // Determine BetMarket type
          let betMarket: 'moneyline' | 'spread' | 'totals' | 'other' = 'moneyline';
          if (marketData) {
            const mktLower = marketData.market.toLowerCase();
            if (/gol.*no.*gol|btts|both.*team/i.test(mktLower)) betMarket = 'other';
            else if (/over|under|total/i.test(mktLower)) betMarket = 'totals';
            else if (/handicap|spread/i.test(mktLower)) betMarket = 'spread';
            else if (/1x2|esito|result|winner/i.test(mktLower)) betMarket = 'moneyline';
          }

          // Build selection display: "Market: Selection" or just selection
          let selectionDisplay = marketData
            ? `${marketData.market}: ${marketData.selection}`
            : event;

          selections.push({
            event: league ? `${league} — ${event}` : event,
            selection: selectionDisplay,
            odds: marketData?.odds || 0,
            category: leagueData.category,
            market: betMarket,
            league: league || leagueData.league,
            kickoff,
          });

          continue; // Don't increment i again — already moved past this block
        } else {
          // Only one "team" line, not a real block — rewind
          i--; // go back to where team1 was
        }
      }

      // If we haven't consumed a block, just move to next line
      if (i === startIdx) i++;
    }

    // ── FALLBACK: English/International "Team A vs Team B" pattern ──
    if (selections.length === 0) {
      const eventPattern = /([A-Za-z][A-Za-z\s.'-]{2,})\s+(?:vs\.?|v\.?|versus|@)\s+([A-Za-z][A-Za-z\s.'-]{2,})/gi;
      const allOdds = this.extractAllOdds(lines, text);
      let match;
      let idx = 0;
      while ((match = eventPattern.exec(text)) !== null) {
        const event = match[0].trim();
        if (event.length > 5) {
          const lineIdx = lines.findIndex(l => l.includes(match![0].trim()));
          const context = lineIdx >= 0 ? lines.slice(Math.max(0, lineIdx - 1), Math.min(lines.length, lineIdx + 3)) : [];
          const contextText = context.join(' ');
          const leagueData = this.inferLeagueAndCategory(contextText, event);
          const mkt = this.inferMarket(contextText, event);
          const ko = this.inferKickoff(contextText);

          selections.push({
            event: this.buildEventLabel(event, leagueData.league, ko),
            selection: event,
            odds: idx < allOdds.length ? allOdds[idx] : 0,
            category: leagueData.category,
            market: mkt,
            league: leagueData.league,
            kickoff: ko,
          });
          idx++;
        }
      }
    }

    // ── FALLBACK: No structured data found at all ──
    if (selections.length === 0) {
      const allOdds = this.extractAllOdds(lines, text);
      if (allOdds.length > 0) {
        const title = lines.find(l => l.length > 3 && !/^[\d.,€$£@]+$/.test(l)) || 'Scanned Bet';
        const leagueData = this.inferLeagueAndCategory(text);
        selections.push({
          event: title,
          selection: title,
          odds: allOdds[0],
          category: leagueData.category,
          market: this.inferMarket(text),
          league: leagueData.league,
          kickoff: this.inferKickoff(text),
        });
      }
    }

    // ── FALLBACK: Assign collected odds to legs that have odds = 0 ──
    // If block parser found legs but couldn't extract odds, collect ALL odds
    // from the full text and assign them to legs in sequential order.
    const missingOddsCount = selections.filter(s => s.odds === 0).length;
    if (missingOddsCount > 0 && selections.length > 0) {
      const collectedOdds = this.extractAllOdds(lines, text);
      // Remove odds that are already assigned to selections
      const usedOdds = new Set(selections.filter(s => s.odds > 0).map(s => s.odds));
      const availableOdds = collectedOdds.filter(o => !usedOdds.has(o));

      // Also try: if we have exactly as many odds as legs, use all
      const oddsToUse = availableOdds.length >= missingOddsCount
        ? availableOdds
        : collectedOdds.length >= selections.length
          ? collectedOdds
          : availableOdds;

      let oddsIdx = 0;
      for (let s = 0; s < selections.length; s++) {
        if (selections[s].odds === 0 && oddsIdx < oddsToUse.length) {
          // If we have all odds matching all legs, use positional assignment
          if (collectedOdds.length >= selections.length) {
            selections[s].odds = collectedOdds[s] || 0;
          } else {
            selections[s].odds = oddsToUse[oddsIdx++];
          }
        }
      }
    }

    // ── COMPUTE TOTALS ──
    let totalOdds = 0;
    if (selections.length > 1) {
      const validOdds = selections.filter(s => s.odds > 0);
      totalOdds = validOdds.length > 0 ? validOdds.reduce((acc, s) => acc * s.odds, 1) : 0;
    } else if (selections.length === 1 && selections[0].odds > 0) {
      totalOdds = selections[0].odds;
    }

    // Aggregate leagues
    selections.forEach(s => { if (s.league) foundLeagues.add(s.league); });
    const aggregatedLeague = foundLeagues.size > 1
      ? Array.from(foundLeagues).join(', ')
      : foundLeagues.size === 1
        ? Array.from(foundLeagues)[0]
        : undefined;

    // Title
    let title = '';
    if (selections.length > 1) {
      title = `Parlay (${selections.length} legs)`;
    } else if (selections.length === 1) {
      title = selections[0].event;
    } else {
      title = lines.find(l => l.length > 3 && !/^[\d.,€$£]+$/.test(l)) || 'Scanned Bet';
    }

    // Potential win: only use value extracted directly from the ticket, no calculation
    const potentialWin = extractedPotentialWin;

    return {
      title,
      bookmaker,
      stake,
      odds: Number(totalOdds.toFixed(2)),
      potentialWin: Number(potentialWin.toFixed(2)),
      detectedLang,
      rawText: text,
      selections,
      betType: selections.length > 1 ? 'parlay' : 'single',
      market: selections[0]?.market || this.inferMarket(text),
      league: aggregatedLeague,
    };
  }

  /**
   * Extract all odds values from text (helper for fallback parsers)
   */
  private extractAllOdds(lines: string[], fullText: string): number[] {
    const allOdds: number[] = [];

    // @-prefixed odds
    const atOddsRegex = /@\s*(\d+[.,]\d+)/g;
    let m;
    while ((m = atOddsRegex.exec(fullText)) !== null) {
      const val = parseFloat(m[1].replace(',', '.'));
      if (val > 1 && val < 1000 && !allOdds.includes(val)) allOdds.push(val);
    }

    // Labeled odds
    const labeledOddsRegex = /(?:odds|quota|cuota|cote)[:\s]*(\d+[.,]\d+)/gi;
    while ((m = labeledOddsRegex.exec(fullText)) !== null) {
      const val = parseFloat(m[1].replace(',', '.'));
      if (val > 1 && val < 1000 && !allOdds.includes(val)) allOdds.push(val);
    }

    // Standalone decimal odds on their own line
    for (const line of lines) {
      const standalone = line.match(/^(\d+[.,]\d{1,3})$/);
      if (standalone) {
        const val = parseFloat(standalone[1].replace(',', '.'));
        if (val > 1.01 && val < 100 && !allOdds.includes(val)) allOdds.push(val);
      }
    }

    // Inline odds at end of line
    for (const line of lines) {
      const inline = line.match(/(\d+[.,]\d{2})\s*$/);
      if (inline) {
        const val = parseFloat(inline[1].replace(',', '.'));
        if (val > 1.01 && val < 100 && !allOdds.includes(val)) allOdds.push(val);
      }
    }

    return allOdds;
  }

  /**
   * Detect language from text
   */
  private detectLanguage(text: string): string {
    const lowerText = text.toLowerCase();

    const langPatterns: Record<string, string[]> = {
      it: ['scommessa', 'quota', 'importo', 'vincita', 'puntata', 'multipla', 'esito'],
      es: ['apuesta', 'cuota', 'cantidad', 'ganancia', 'casa', 'combinada'],
      fr: ['pari', 'cote', 'montant', 'gain', 'combiné'],
      de: ['wette', 'quote', 'betrag', 'gewinn', 'buchmacher', 'kombiwette'],
    };

    for (const [lang, keywords] of Object.entries(langPatterns)) {
      let matchCount = 0;
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) matchCount++;
      }
      if (matchCount >= 1) return lang;
    }

    return 'en';
  }
}

export default new OCRService();
