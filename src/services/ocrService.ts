import * as FileSystem from 'expo-file-system';
import { GOOGLE_VISION_API_KEY, GOOGLE_VISION_ENDPOINT } from '../config/ocr';
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
   * Extract bet data from image using Google Vision API.
   * Throws a clear error if the key is missing or extraction fails.
   */
  async extractBetData(imageUri: string): Promise<OCRExtractionResult> {
    const base64Image = await this.imageToBase64(imageUri);

    // Ensure Google Vision API key is configured
    if (!GOOGLE_VISION_API_KEY) {
      throw new Error('Google Vision API key is not configured. Please add EXPO_PUBLIC_GOOGLE_VISION_API_KEY to your .env file.');
    }

    // Call Google Vision — let errors propagate with real messages
    const text = await this.callGoogleVision(base64Image);
    if (!text || text.trim().length === 0) {
      throw new Error('No text detected in image. Please ensure the bet ticket is clearly visible and well-lit.');
    }

    console.log('[OCR] Raw text extracted (first 500 chars):', text.substring(0, 500));

    const result = this.parseBetData(text);

    // Validate we got something useful
    if (!result.title && result.selections.length === 0) {
      throw new Error('Could not identify any bets in this image. Try a clearer photo or enter manually.');
    }

    return result;
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
      throw new Error('Failed to process image. Please try again later.'); // Generic error for UI
    }

    const data = await response.json();

    // Check for API-level errors in the response body
    const apiError = data.responses?.[0]?.error;
    if (apiError) {
      console.error(`[Vision API Error in Response]: ${apiError.message || 'unknown error'}`);
      throw new Error('Failed to process image. Please try again later.'); // Generic error for UI
    }

    const text = data.responses?.[0]?.fullTextAnnotation?.text || '';
    if (!text) {
      throw new Error('No text found in image. The image may be too blurry, dark, or not contain readable text.');
    }
    return text;
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
      'better', 'eplay24', 'domusbet',
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

    // --- EVENT DETECTION (multi-pattern) ---
    // Pattern 1: Classic "Team A vs Team B"
    const eventPattern = /([\w\s.'-]+)\s+(?:vs\.?|v\.s\.|versus|@|-)\s+([\w\s.'-]+)/gi;
    const eventMatches: { event: string; lineIndex: number; context: string[] }[] = [];
    let eventMatch;
    while ((eventMatch = eventPattern.exec(text)) !== null) {
      const event = eventMatch[0].trim();
      if (event.length > 5 && !eventMatches.some(e => e.event === event)) {
        const lineIdx = lines.findIndex(l => l.includes(eventMatch![0].trim()));
        const context = lineIdx >= 0
          ? lines.slice(Math.max(0, lineIdx - 1), Math.min(lines.length, lineIdx + 3))
          : [];
        eventMatches.push({ event, lineIndex: lineIdx, context });
      }
    }

    // Pattern 2: If no "vs" found, try lines with " - " or " / " separators (common in Italian/European slips)
    if (eventMatches.length === 0) {
      const altSeparators = /^(.{3,30})\s+[-\/]\s+(.{3,30})$/;
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(altSeparators);
        if (match) {
          const event = lines[i].trim();
          if (!eventMatches.some(e => e.event === event)) {
            const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3));
            eventMatches.push({ event, lineIndex: i, context });
          }
        }
      }
    }

    // Pattern 3: If still nothing, look for lines that seem like team/match names
    // (lines with 2+ capitalized words, not numbers-only, not short labels)
    if (eventMatches.length === 0) {
      const teamLinePattern = /^[A-Z][a-zA-Z\s.'-]{4,}$/;
      const candidateLines = lines.filter(l => 
        teamLinePattern.test(l) && 
        !/^\d/.test(l) && 
        !/^(stake|bet|odds|total|quota|win|loss|puntata|vincita)/i.test(l)
      );
      // Group consecutive team-like lines as events
      for (let i = 0; i < candidateLines.length; i++) {
        const lineIdx = lines.indexOf(candidateLines[i]);
        const context = lineIdx >= 0
          ? lines.slice(Math.max(0, lineIdx - 1), Math.min(lines.length, lineIdx + 3))
          : [];
        eventMatches.push({
          event: candidateLines[i],
          lineIndex: lineIdx,
          context,
        });
      }
    }

    // --- ODDS EXTRACTION (comprehensive) ---
    const allOdds: number[] = [];

    // Pattern A: @-prefixed odds (e.g., "@1.85", "@ 2.10")
    const atOddsRegex = /@\s*(\d+[.,]\d+)/g;
    let oddsMatch;
    while ((oddsMatch = atOddsRegex.exec(text)) !== null) {
      const val = parseFloat(oddsMatch[1].replace(',', '.'));
      if (val > 1 && val < 1000 && !allOdds.includes(val)) allOdds.push(val);
    }

    // Pattern B: Labeled odds ("odds: 1.85", "quota: 2.10", etc.)
    const labeledOddsRegex = /(?:odds|quota|cuota|cote)[:\s]*(\d+[.,]\d+)/gi;
    while ((oddsMatch = labeledOddsRegex.exec(text)) !== null) {
      const val = parseFloat(oddsMatch[1].replace(',', '.'));
      if (val > 1 && val < 1000 && !allOdds.includes(val)) allOdds.push(val);
    }

    // Pattern C: Standalone decimal odds on their own line ("1.85", "2.10")
    for (const line of lines) {
      const standaloneOdds = line.match(/^(\d+[.,]\d{1,3})$/);
      if (standaloneOdds) {
        const val = parseFloat(standaloneOdds[1].replace(',', '.'));
        if (val > 1.01 && val < 100 && !allOdds.includes(val)) {
          allOdds.push(val);
        }
      }
    }

    // Pattern D: Odds appearing next to text on the same line (e.g., "Man Utd 1.85")
    for (const line of lines) {
      const inlineOdds = line.match(/(\d+[.,]\d{2})\s*$/);
      if (inlineOdds) {
        const val = parseFloat(inlineOdds[1].replace(',', '.'));
        if (val > 1.01 && val < 100 && !allOdds.includes(val)) {
          allOdds.push(val);
        }
      }
    }

    // --- BUILD SELECTIONS ---
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

    // If no events matched but we have odds, create a fallback single bet from context
    if (selections.length === 0 && allOdds.length > 0) {
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

    // Calculate total odds
    let totalOdds = 0;
    if (selections.length > 1) {
      const validSelOdds = selections.filter(s => s.odds > 0);
      totalOdds = validSelOdds.length > 0 ? validSelOdds.reduce((acc, s) => acc * s.odds, 1) : 0;
    } else if (selections.length === 1 && selections[0].odds > 0) {
      totalOdds = selections[0].odds;
    } else if (allOdds.length > 0) {
      totalOdds = allOdds[0];
    }

    // Fallback for total odds from labeled patterns
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

    // Extract potential win
    let extractedPotentialWin = 0;
    const potWinPatterns = [
      /(?:potential\s*win|vincita\s*potenziale|ganancia|gewinn|gain)[:\s]*[$€£]?\s*(\d+[.,]?\d*)/i,
      /(?:to\s*win|returns?)[:\s]*[$€£]?\s*(\d+[.,]?\d*)/i,
    ];
    for (const pattern of potWinPatterns) {
      const match = text.match(pattern);
      if (match) {
        extractedPotentialWin = parseFloat(match[1].replace(',', '.'));
        break;
      }
    }

    // Title
    let title = '';
    if (selections.length > 1) {
      title = `Parlay (${selections.length} legs)`;
    } else if (selections.length === 1) {
      title = selections[0].event;
    } else if (lines.length > 0) {
      title = lines.find(l => l.length > 3 && !/^[\d.,€$£]+$/.test(l)) || lines[0].substring(0, 50);
    }

    if (!title) title = 'Scanned Bet';

    const potentialWin = extractedPotentialWin > 0 ? extractedPotentialWin : stake * totalOdds;
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
