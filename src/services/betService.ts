import { supabase, BetRow } from '../config/supabase';
import {
  Bet,
  BetCategory,
  BetType,
  BetMarket,
  BetStatus,
  BetSelection,
  BetSource,
  OddsFormat,
} from '../types';

export interface BetRealtimeChange {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  bet?: Bet;
  betId?: string;
}

class BetService {
  private normalizeSelections(
    rawSelections: BetSelection[] | null,
    fallbackMarket: BetMarket,
    fallbackFormat: OddsFormat,
  ): BetSelection[] {
    if (!rawSelections?.length) return [];
    return rawSelections.map(sel => ({
      ...sel,
      oddsFormat: sel.oddsFormat || fallbackFormat,
      market: sel.market || fallbackMarket,
      kickoff: sel.kickoff || null,
    }));
  }

  private mapRowToBet(row: BetRow): Bet {
    return {
      id: row.id,
      title: row.title,
      bookmaker: row.bookmaker,
      stake: row.stake,
      totalOdds: row.total_odds,
      oddsFormat: row.odds_format as OddsFormat,
      potentialWin: row.potential_win,
      status: row.status as BetStatus,
      date: row.date,
      selections: this.normalizeSelections(
        row.selections as BetSelection[],
        (row.market || 'other') as BetMarket,
        (row.odds_format || 'decimal') as OddsFormat,
      ),
      notes: row.notes || undefined,
      category: row.category as BetCategory,
      betType: row.bet_type as BetType,
      market: (row.market || 'other') as BetMarket,
      league: row.league || undefined,
      source: (row.source || 'manual') as BetSource,
      archived: !!row.archived,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapBetToRow(
    bet: Omit<Bet, 'id' | 'createdAt' | 'updatedAt'>,
    userId: string,
  ): Omit<BetRow, 'id' | 'created_at' | 'updated_at'> {
    return {
      user_id: userId,
      title: bet.title,
      bookmaker: bet.bookmaker,
      stake: bet.stake,
      total_odds: bet.totalOdds,
      odds_format: bet.oddsFormat,
      potential_win: bet.potentialWin,
      status: bet.status,
      date: bet.date,
      selections: bet.selections,
      notes: bet.notes || null,
      category: bet.category,
      bet_type: bet.betType,
      market: bet.market || 'other',
      league: bet.league || null,
      source: bet.source,
      archived: bet.archived ?? false,
    };
  }

  async getBets(): Promise<Bet[]> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
      .from('bets')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map(row => this.mapRowToBet(row));
  }

  async getBetById(id: string): Promise<Bet | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
      .from('bets')
      .select('*')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(error.message);
    }

    return data ? this.mapRowToBet(data) : null;
  }

  async createBet(bet: Omit<Bet, 'id' | 'createdAt' | 'updatedAt'>): Promise<Bet> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
      .from('bets')
      .insert(this.mapBetToRow(bet, session.user.id))
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapRowToBet(data);
  }

  async updateBet(id: string, updates: Partial<Bet>): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Not authenticated');
    }

    const updateData: any = {};
    if (updates.title) updateData.title = updates.title;
    if (updates.bookmaker) updateData.bookmaker = updates.bookmaker;
    if (updates.stake !== undefined) updateData.stake = updates.stake;
    if (updates.totalOdds !== undefined) updateData.total_odds = updates.totalOdds;
    if (updates.potentialWin !== undefined) updateData.potential_win = updates.potentialWin;
    if (updates.oddsFormat) updateData.odds_format = updates.oddsFormat;
    if (updates.status) updateData.status = updates.status;
    if (updates.date) updateData.date = updates.date;
    if (updates.selections) updateData.selections = updates.selections;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.category) updateData.category = updates.category;
    if (updates.betType) updateData.bet_type = updates.betType;
    if (updates.market) updateData.market = updates.market;
    if (updates.league !== undefined) updateData.league = updates.league || null;
    if (updates.source) updateData.source = updates.source;
    if (updates.archived !== undefined) updateData.archived = updates.archived;

    const { error } = await supabase
      .from('bets')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  async deleteBet(id: string): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Not authenticated');
    }

    const { error } = await supabase
      .from('bets')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  async deleteAllBets(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Not authenticated');
    }

    const { error } = await supabase
      .from('bets')
      .delete()
      .eq('user_id', session.user.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  async updateBetStatus(id: string, status: BetStatus): Promise<void> {
    await this.updateBet(id, { status });
  }

  // Subscribe to real-time changes
  subscribeToBets(callback: (change: BetRealtimeChange) => void) {
    return supabase
      .channel('bets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bets' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            callback({ eventType: 'DELETE', betId: String((payload.old as BetRow).id) });
            return;
          }

          callback({
            eventType: payload.eventType as 'INSERT' | 'UPDATE',
            bet: this.mapRowToBet(payload.new as BetRow),
          });
        }
      )
      .subscribe();
  }
}

export default new BetService();
