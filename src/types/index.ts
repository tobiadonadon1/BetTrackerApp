export type BetStatus = 'pending' | 'won' | 'lost' | 'void';
export type BetCategory = 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'Soccer' | 'Tennis' | 'UFC' | 'Boxing' | 'Golf' | 'Other';
export type BetType = 'single' | 'parlay' | 'teaser' | 'round-robin';
export type BetMarket = 'moneyline' | 'spread' | 'totals' | 'other';
export type OddsFormat = 'decimal' | 'american';
export type BetSource = 'manual' | 'scan-camera' | 'scan-gallery';

export interface BetSelection {
  id: string;
  event: string;
  selection: string;
  odds: number;
  oddsFormat: OddsFormat;
  status: BetStatus;
  category: BetCategory;
  market: BetMarket;
  kickoff?: string | null;
}

export interface Bet {
  id: string;
  title: string;
  bookmaker: string;
  stake: number;
  totalOdds: number;
  oddsFormat: OddsFormat;
  potentialWin: number;
  status: BetStatus;
  date: string;
  selections: BetSelection[];
  notes?: string;
  category: BetCategory;
  betType: BetType;
  market: BetMarket;
  league?: string;
  source: BetSource;
  /** When true, bet is hidden from Recent and listed under Archive (parlays: swipe). */
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardUser {
  id: string;
  username: string;
  totalBets: number;
  winRate: number;
  profitLoss: number;
  roi: number;
  rank: number;
  isFollowing: boolean;
}
