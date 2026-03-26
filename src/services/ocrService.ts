import * as FileSystem from 'expo-file-system';
import { GOOGLE_VISION_API_KEY, GOOGLE_VISION_ENDPOINT } from '../config/ocr';
import { supabase } from '../config/supabase';
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
   * Convert image URI to base64 using expo-file-system (reliable in React Native)
   */
  async imageToBase64(imageUri: string): Promise<string> {
    try {
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: 'base64' as any,
      });
      return base64;
    } catch (error) {
      console.error('Error converting image to base64:', error);
      throw new Error('Failed to process image');
    }
  }

  /**
   * Extract bet data from image.
   * 1. Try Google Vision API directly (if env key is set)
   * 2. Try OCR.space free API (no config needed)
   * 3. Fall back to Supabase Edge Function (server-side OCR)
   * 4. NEVER returns mock data — shows error instead
   */
  async extractBetData(imageUri: string): Promise<OCRExtractionResult> {
    const base64Image = await this.imageToBase64(imageUri);

    // Strategy 1: Direct Google Vision API (if client-side key available)
    if (GOOGLE_VISION_API_KEY) {
      try {
        const text = await this.callGoogleVision(base64Image);
        if (text) {
          return this.parseBetData(text);
        }
      } catch (error) {
        console.warn('Direct Vision API failed, trying OCR.space...', error);
      }
    }

    // Strategy 2: OCR.space free API (works out of the box, no configuration needed)
    try {
      const text = await this.callOCRSpace(base64Image);
      if (text) {
        return this.parseBetData(text);
      }
    } catch (error) {
      console.warn('OCR.space failed, trying Edge Function...', error);
    }

    // Strategy 3: Supabase Edge Function (server-side OCR with configured keys)
    try {
      const text = await this.callEdgeFunction(base64Image);
      if (text) {
        return this.parseBetData(text);
      }
    } catch (error) {
      console.warn('Edge Function OCR failed:', error);
    }

    // No fallback to mock data — throw clear error
    throw new Error(
      'Could not extract text from this image. Please ensure the image is clear and well-lit, or enter the bet details manually.'
    );
  }

  /**
   * Call Google Vision API directly
   */
  private async callGoogleVision(base64Image: string): Promise<string> {
    const response = await fetch(`${GOOGLE_VISION_ENDPOINT}?key=${GOOGLE_VISION_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Image },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
        }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.responses?.[0]?.fullTextAnnotation?.text || '';
    if (!text) {
      throw new Error('No text found in image');
    }
    return text;
  }

  /**
   * Call OCR.space free API — no API key configuration required
   * Free tier: 25,000 requests/month, 1MB limit per image
   */
  private async callOCRSpace(base64Image: string): Promise<string> {
    const formData = new FormData();
    formData.append('base64Image', `data:image/jpeg;base64,${base64Image}`);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2');  // Engine 2 gives better accuracy; falls back gracefully if unavailable

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: 'helloworld' },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OCR.space HTTP error: ${response.status}`);
    }

    const data = await response.json();

    if (data.IsErroredOnProcessing) {
      throw new Error(
        Array.isArray(data.ErrorMessage)
          ? data.ErrorMessage[0]
          : data.ErrorMessage || 'OCR.space processing error'
      );
    }

    const text = data.ParsedResults?.[0]?.ParsedText;
    if (!text?.trim()) {
      throw new Error('No text extracted from image via OCR.space');
    }

    return text;
  }

  /**
   * Call Supabase Edge Function for server-side OCR
   */
  private async callEdgeFunction(base64Image: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('ocr-extract', {
      body: { image: base64Image },
    });

    if (error) {
      throw new Error(error.message || 'Edge Function call failed');
    }

    if (!data?.text) {
      throw new Error('No text extracted from image');
    }

    return data.text;
  }

  /**
   * Parse extracted text to bet data, detecting multiple legs if present
   */
  parseBetData(text: string): OCRExtractionResult {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const fullText = text.toLowerCase();

    const detectedLang = this.detectLanguage(text);

    // Extract bookmaker
    const bookmakerKeywords = [
      'bet365', 'draftkings', 'fanduel', 'william hill', 'betfair',
      'pinnacle', 'betmgm', 'caesars', 'pointsbet', 'betway',
      'unibet', 'betsson', 'bwin', 'ladbrokes', 'coral',
      'paddy power', 'pokerstars', 'stake', 'marathon', 'snai',
      'sisal', 'eurobet', 'goldbet', 'lottomatica', 'betclic',
      'sportingbet', 'bovada', 'betonline', '888sport', 'skybet',
    ];
    let bookmaker = 'Unknown';
    for (const keyword of bookmakerKeywords) {
      if (fullText.includes(keyword)) {
        bookmaker = keyword.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        break;
      }
    }

    // Extract stake (multi-currency)
    let stake = 0;
    const stakePatterns = [
      /(?:stake|puntata|apuesta|mise|einsatz)[:\s]*[$€£]?\s*(\d+[.,]?\d*)/i,
      /(?:bet|scommessa)[:\s]*[$€£]?\s*(\d+[.,]?\d*)/i,
      /(?:amount|importo|importe|montant|betrag)[:\s]*[$€£]?\s*(\d+[.,]?\d*)/i,
      /(?:total\s*(?:stake|bet)?)[:\s]*[$€£]?\s*(\d+[.,]?\d*)/i,
      /[$€£]\s*(\d+[.,]?\d+)/,
    ];
    for (const pattern of stakePatterns) {
      const match = text.match(pattern);
      if (match) {
        stake = parseFloat(match[1].replace(',', '.'));
        break;
      }
    }

    // Try to detect multiple events (legs) from the text
    const eventPattern = /([\w\s.'-]+)\s+(?:vs\.?|v\.s\.|versus|@|-)\s+([\w\s.'-]+)/gi;
    const eventMatches: { event: string; lineIndex: number; context: string[] }[] = [];
    let eventMatch;
    while ((eventMatch = eventPattern.exec(text)) !== null) {
      const event = eventMatch[0].trim();
      // Avoid duplicates and very short matches
      if (event.length > 5 && !eventMatches.some(e => e.event === event)) {
        const lineIdx = lines.findIndex(l => l.includes(eventMatch![0].trim()));
        const context = lineIdx >= 0
          ? lines.slice(Math.max(0, lineIdx - 1), Math.min(lines.length, lineIdx + 3))
          : [];
        eventMatches.push({ event, lineIndex: lineIdx, context });
      }
    }

    // Extract all odds from the text
    const allOdds: number[] = [];
    const oddsRegex = /@\s*(\d+[.,]\d+)|(\d+[.,]\d+)\s*odds|odds[:\s]*(\d+[.,]\d+)|(?:quota|cuota|cote)[:\s]*(\d+[.,]\d+)/gi;
    let oddsMatch;
    while ((oddsMatch = oddsRegex.exec(text)) !== null) {
      const val = parseFloat((oddsMatch[1] || oddsMatch[2] || oddsMatch[3] || oddsMatch[4]).replace(',', '.'));
      if (val > 1 && val < 1000) {
        allOdds.push(val);
      }
    }

    // Also try standalone decimal odds patterns (e.g. lines with just "1.85", "2.10")
    for (const line of lines) {
      const standaloneOdds = line.match(/^(\d+[.,]\d{2})$/);
      if (standaloneOdds) {
        const val = parseFloat(standaloneOdds[1].replace(',', '.'));
        if (val > 1 && val < 100 && !allOdds.includes(val)) {
          allOdds.push(val);
        }
      }
    }

    // Build selections if we have multiple events
    const selections: OCRSelectionResult[] = [];

    if (eventMatches.length > 0) {
      for (let i = 0; i < eventMatches.length; i++) {
        const eventMatchData = eventMatches[i];
        const odds = i < allOdds.length ? allOdds[i] : 0;
        const contextText = eventMatchData.context.join(' ');
        const leagueData = this.inferLeagueAndCategory(contextText, eventMatchData.event);
        const market = this.inferMarket(contextText, eventMatchData.event);
        const kickoff = this.inferKickoff(contextText);
        const selectionLine = eventMatchData.context.find(line => {
          const normalized = line.toLowerCase();
          return !normalized.includes(eventMatchData.event.toLowerCase()) && !/@\s*\d/.test(line);
        });

        selections.push({
          event: this.buildEventLabel(eventMatchData.event, leagueData.league, kickoff),
          selection: selectionLine || eventMatchData.event,
          odds,
          category: leagueData.category,
          market,
          league: leagueData.league,
          kickoff,
        });
      }
    }

    // Calculate total odds
    let totalOdds = 0;
    if (selections.length > 1) {
      const validSelOdds = selections.filter(s => s.odds > 0);
      totalOdds = validSelOdds.length > 0 ? validSelOdds.reduce((acc, s) => acc * s.odds, 1) : 0;
    } else if (allOdds.length > 0) {
      totalOdds = allOdds[0];
    }

    // Fallback for single odds extraction
    if (totalOdds === 0) {
      const singleOddsPatterns = [
        /odds[:\s]*(\d+[.,]?\d*)/i,
        /@\s*(\d+[.,]?\d*)/,
        /(\d+[.,]?\d*)\s*odds/i,
        /total[\s\w]*odd[:\s]*(\d+[.,]?\d*)/i,
        /(?:quota|cuota|cote)\s*(?:totale?)?\s*[:\s]*(\d+[.,]?\d*)/i,
      ];
      for (const pattern of singleOddsPatterns) {
        const match = text.match(pattern);
        if (match) {
          totalOdds = parseFloat(match[1].replace(',', '.'));
          break;
        }
      }
    }

    // Title
    let title = '';
    if (selections.length > 1) {
      title = `Parlay (${selections.length} legs)`;
    } else if (selections.length === 1) {
      title = selections[0].event;
    } else if (lines.length > 0) {
      // Use first meaningful line as title
      title = lines.find(l => l.length > 3 && !/^[\d.,€$£]+$/.test(l)) || lines[0].substring(0, 50);
    }

    if (!title) title = 'Scanned Bet';

    const potentialWin = stake * totalOdds;
    const betType = selections.length > 1 ? 'parlay' : 'single';
    const inferredLeague = selections.find(selection => selection.league)?.league;
    const inferredMarket = selections[0]?.market || this.inferMarket(text);

    return {
      title,
      bookmaker,
      stake,
      odds: Number(totalOdds.toFixed(2)),
      potentialWin: Number(potentialWin.toFixed(2)),
      detectedLang,
      rawText: text,
      selections,
      betType,
      market: inferredMarket,
      league: inferredLeague,
    };
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
