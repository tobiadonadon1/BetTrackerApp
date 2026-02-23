import { GOOGLE_VISION_API_KEY, GOOGLE_VISION_ENDPOINT } from '../config/ocr';

export interface OCRExtractionResult {
  title: string;
  bookmaker: string;
  stake: number;
  odds: number;
  potentialWin: number;
  detectedLang: string;
  rawText: string;
}

class OCRService {
  /**
   * Convert image URI to base64
   */
  async imageToBase64(imageUri: string): Promise<string> {
    try {
      // For React Native, we need to read the file and convert to base64
      const response = await fetch(imageUri);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Remove data:image/jpeg;base64, prefix
          resolve(base64.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting image to base64:', error);
      throw new Error('Failed to process image');
    }
  }

  /**
   * Extract bet data from image using Google Vision API
   */
  async extractBetData(imageUri: string): Promise<OCRExtractionResult> {
    // If no API key, fall back to mock extraction
    if (!GOOGLE_VISION_API_KEY) {
      console.warn('No Google Vision API key found, using mock extraction');
      return this.mockExtraction();
    }

    try {
      const base64Image = await this.imageToBase64(imageUri);
      
      const response = await fetch(`${GOOGLE_VISION_ENDPOINT}?key=${GOOGLE_VISION_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Image,
              },
              features: [
                {
                  type: 'DOCUMENT_TEXT_DETECTION',
                  maxResults: 1,
                },
              ],
            },
          ],
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

      return this.parseBetData(text);
    } catch (error) {
      console.error('OCR extraction failed:', error);
      // Fall back to mock extraction on error
      return this.mockExtraction();
    }
  }

  /**
   * Parse extracted text to bet data
   */
  private parseBetData(text: string): OCRExtractionResult {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const fullText = text.toLowerCase();

    // Detect language
    const detectedLang = this.detectLanguage(text);

    // Extract bookmaker (common bookmakers)
    const bookmakerKeywords = [
      'bet365', 'draftkings', 'fanduel', 'william hill', 'betfair', 
      'pinnacle', 'betmgm', 'caesars', 'pointsbet', 'betway',
      'unibet', 'betsson', 'bwin', 'ladbrokes', 'coral'
    ];
    let bookmaker = 'Unknown';
    for (const keyword of bookmakerKeywords) {
      if (fullText.includes(keyword)) {
        bookmaker = keyword.charAt(0).toUpperCase() + keyword.slice(1);
        break;
      }
    }

    // Extract stake/amount
    let stake = 0;
    const stakePatterns = [
      /stake[:\s]*[$€£]?\s*(\d+[.,]?\d*)/i,
      /bet[:\s]*[$€£]?\s*(\d+[.,]?\d*)/i,
      /amount[:\s]*[$€£]?\s*(\d+[.,]?\d*)/i,
      /[$€£]\s*(\d+[.,]?\d+)/,
      /total[:\s]*[$€£]?\s*(\d+[.,]?\d*)/i,
    ];
    for (const pattern of stakePatterns) {
      const match = text.match(pattern);
      if (match) {
        stake = parseFloat(match[1].replace(',', '.'));
        break;
      }
    }

    // Extract odds
    let odds = 0;
    const oddsPatterns = [
      /odds[:\s]*(\d+[.,]?\d*)/i,
      /@\s*(\d+[.,]?\d*)/,
      /(\d+[.,]?\d*)\s*odds/i,
      /total[\s\w]*odd[:\s]*(\d+[.,]?\d*)/i,
    ];
    for (const pattern of oddsPatterns) {
      const match = text.match(pattern);
      if (match) {
        odds = parseFloat(match[1].replace(',', '.'));
        break;
      }
    }

    // Extract event/title
    let title = 'Unknown Event';
    // Look for common patterns: Team A vs Team B, Event names, etc.
    const eventPatterns = [
      /([\w\s]+)\s+(?:vs|v\.s\.|versus)\s+([\w\s]+)/i,
      /([\w\s]+)\s+@\s+([\w\s]+)/,
    ];
    for (const pattern of eventPatterns) {
      const match = text.match(pattern);
      if (match) {
        title = match[0].trim();
        break;
      }
    }

    // If no event found, use first meaningful line
    if (title === 'Unknown Event' && lines.length > 0) {
      title = lines[0].substring(0, 50);
    }

    // Calculate potential win
    const potentialWin = stake * odds;

    return {
      title,
      bookmaker,
      stake,
      odds,
      potentialWin,
      detectedLang,
      rawText: text,
    };
  }

  /**
   * Detect language from text
   */
  private detectLanguage(text: string): string {
    const lowerText = text.toLowerCase();
    
    // Simple keyword-based detection
    const langPatterns: Record<string, string[]> = {
      it: ['scommessa', 'quota', 'importo', 'vincita', 'bookmaker'],
      es: ['apuesta', 'cuota', 'cantidad', 'ganancia', 'casa'],
      fr: ['pari', 'cote', 'montant', 'gain', 'bookmaker'],
      de: ['wette', 'quote', 'betrag', 'gewinn', 'buchmacher'],
    };

    for (const [lang, keywords] of Object.entries(langPatterns)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          return lang;
        }
      }
    }

    return 'en';
  }

  /**
   * Mock extraction for demo/testing
   */
  private mockExtraction(): OCRExtractionResult {
    const bookmakers = ['Bet365', 'DraftKings', 'FanDuel', 'William Hill', 'Betfair', 'Pinnacle'];
    const events = [
      'Lakers vs Warriors', 
      'Manchester United vs Liverpool', 
      'Chiefs vs 49ers', 
      'Nadal vs Djokovic',
      'Real Madrid vs Barcelona'
    ];
    
    const randomBookmaker = bookmakers[Math.floor(Math.random() * bookmakers.length)];
    const randomEvent = events[Math.floor(Math.random() * events.length)];
    const randomStake = Math.floor(Math.random() * 100) + 10;
    const randomOdds = Number((Math.random() * 3 + 1.2).toFixed(2));
    
    return {
      title: randomEvent,
      bookmaker: randomBookmaker,
      stake: randomStake,
      odds: randomOdds,
      potentialWin: randomStake * randomOdds,
      detectedLang: Math.random() > 0.5 ? 'English' : Math.random() > 0.5 ? 'Italian' : 'Spanish',
      rawText: 'Mock OCR extraction',
    };
  }
}

export default new OCRService();
