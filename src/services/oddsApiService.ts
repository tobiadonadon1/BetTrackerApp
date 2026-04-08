import { ODDS_API_KEY, ODDS_API_BASE_URL } from '../config/oddsApi';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Sport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

export interface MarketOdds {
  key: string; // h2h, spreads, totals, btts, double_chance
  outcomes: {
    name: string; // e.g. "Team A", "Over", "Yes", "1X"
    price: number; // decimal odds
    point?: number; // for spreads and totals
  }[];
}

class OddsApiService {
  // Memory Caches
  private sportsCache: { data: Sport[]; timestamp: number } | null = null;
  private eventsCache: Map<string, { data: OddsApiEvent[]; timestamp: number }> = new Map();
  private oddsCache: Map<string, { data: MarketOdds[]; timestamp: number }> = new Map();

  // Cache TTLs
  private SPORTS_TTL = 1000 * 60 * 60 * 24; // 24 hours
  private EVENTS_TTL = 1000 * 60 * 60 * 6;  // 6 hours
  private ODDS_TTL = 1000 * 60 * 10;        // 10 minutes

  async getActiveSports(): Promise<Sport[]> {
    if (!ODDS_API_KEY) return [];

    if (this.sportsCache && Date.now() - this.sportsCache.timestamp < this.SPORTS_TTL) {
      return this.sportsCache.data;
    }

    try {
      const response = await fetch(`${ODDS_API_BASE_URL}/sports/?apiKey=${ODDS_API_KEY}`);
      if (!response.ok) throw new Error('Failed to fetch sports');
      const data: Sport[] = await response.json();
      
      this.sportsCache = { data, timestamp: Date.now() };
      return data;
    } catch (error) {
      console.error('OddsApi Error (Sports):', error);
      return [];
    }
  }

  async getEventsForSport(sportKey: string): Promise<OddsApiEvent[]> {
    if (!ODDS_API_KEY) return [];

    const cached = this.eventsCache.get(sportKey);
    if (cached && Date.now() - cached.timestamp < this.EVENTS_TTL) {
      return cached.data;
    }

    try {
      // Just fetch events, not odds, to save credits (if api supports it, otherwise use /odds with lightweight params)
      // Actually, `/sports/{sportKey}/events` is free or 1 point per request!
      const response = await fetch(`${ODDS_API_BASE_URL}/sports/${sportKey}/events/?apiKey=${ODDS_API_KEY}`);
      if (!response.ok) throw new Error('Failed to fetch events');
      const data: OddsApiEvent[] = await response.json();

      const uniqueEvents = Array.from(new Map(data.map(item => [item.id, item])).values());
      
      this.eventsCache.set(sportKey, { data: uniqueEvents, timestamp: Date.now() });
      return uniqueEvents;
    } catch (error) {
      console.error('OddsApi Error (Events):', error);
      return [];
    }
  }

  async getOddsForEvent(sportKey: string, eventId: string): Promise<MarketOdds[]> {
    if (!ODDS_API_KEY) return [];

    const cacheKey = `${sportKey}_${eventId}`;
    const cached = this.oddsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.ODDS_TTL) {
      return cached.data;
    }

    try {
      // Fetch multiple markets at once to give users all options
      const regions = 'eu,us';
      const markets = 'h2h,spreads,totals,btts';
      const response = await fetch(`${ODDS_API_BASE_URL}/sports/${sportKey}/events/${eventId}/odds/?regions=${regions}&markets=${markets}&apiKey=${ODDS_API_KEY}`);
      
      if (!response.ok) throw new Error('Failed to fetch event odds');
      const data = await response.json();

      let compiledMarkets: MarketOdds[] = [];

      // The API returns an object with a `bookmakers` array. We will grab the first/best bookmaker's odds.
      if (data && data.bookmakers && data.bookmakers.length > 0) {
        // Just take the first bookmaker for simplicity in providing representative market odds
        const bookie = data.bookmakers[0];
        compiledMarkets = bookie.markets;
      }

      // Automatically generate Double Chance if we have H2H (1X2)
      const h2hMarket = compiledMarkets.find(m => m.key === 'h2h');
      if (h2hMarket && h2hMarket.outcomes.length === 3) {
        // Usually contains Home, Away, Draw
        const draw = h2hMarket.outcomes.find(o => o.name.toLowerCase() === 'draw');
        const others = h2hMarket.outcomes.filter(o => o.name.toLowerCase() !== 'draw');
        
        if (draw && others.length === 2) {
          const opt1 = others[0];
          const opt2 = others[1];

          // Approximation formula for Double Chance using decimal odds:
          // Odds(A or B) = (Odds A * Odds B) / (Odds A + Odds B)
          const doubleChanceOutcomes = [
            {
              name: `${opt1.name} or Draw (1X)`,
              price: Number(((opt1.price * draw.price) / (opt1.price + draw.price)).toFixed(2))
            },
            {
              name: `${opt2.name} or Draw (X2)`,
              price: Number(((opt2.price * draw.price) / (opt2.price + draw.price)).toFixed(2))
            },
            {
              name: `${opt1.name} or ${opt2.name} (12)`,
              price: Number(((opt1.price * opt2.price) / (opt1.price + opt2.price)).toFixed(2))
            }
          ];

          compiledMarkets.push({
            key: 'double_chance',
            outcomes: doubleChanceOutcomes
          });
        }
      }

      this.oddsCache.set(cacheKey, { data: compiledMarkets, timestamp: Date.now() });
      return compiledMarkets;
    } catch (error) {
      console.error('OddsApi Error (Odds):', error);
      return [];
    }
  }

  // Fallback for search (legacy support)
  async searchEvents(query: string): Promise<OddsApiEvent[]> {
    return []; // We will supersede this with full browsing
  }
}

export default new OddsApiService();
