export type BetStatus = 'pending' | 'won' | 'lost' | 'void';
export type BetCategory = 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'Soccer' | 'Tennis' | 'UFC' | 'Boxing' | 'Golf' | 'Other';
export type BetType = 'single' | 'parlay' | 'teaser' | 'round-robin';

export interface BetSelection {
  id: string;
  event: string;
  selection: string;
  odds: number;
  status: BetStatus;
  category: BetCategory;
}

export interface Bet {
  id: string;
  title: string;
  bookmaker: string;
  stake: number;
  totalOdds: number;
  potentialWin: number;
  status: BetStatus;
  date: string;
  selections: BetSelection[];
  notes?: string;
  category: BetCategory;
  betType: BetType;
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
