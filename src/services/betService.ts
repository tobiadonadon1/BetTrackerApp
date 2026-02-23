import { supabase, BetRow } from '../config/supabase';
import { Bet, BetCategory, BetType, BetStatus, BetSelection } from '../types';

class BetService {
  private mapRowToBet(row: BetRow): Bet {
    return {
      id: row.id,
      title: row.title,
      bookmaker: row.bookmaker,
      stake: row.stake,
      totalOdds: row.total_odds,
      potentialWin: row.potential_win,
      status: row.status as BetStatus,
      date: row.date,
      selections: row.selections as BetSelection[],
      notes: row.notes || undefined,
      category: row.category as BetCategory,
      betType: row.bet_type as BetType,
    };
  }

  private mapBetToRow(bet: Omit<Bet, 'id'>, userId: string): Omit<BetRow, 'id' | 'created_at' | 'updated_at'> {
    return {
      user_id: userId,
      title: bet.title,
      bookmaker: bet.bookmaker,
      stake: bet.stake,
      total_odds: bet.totalOdds,
      potential_win: bet.potentialWin,
      status: bet.status,
      date: bet.date,
      selections: bet.selections,
      notes: bet.notes || null,
      category: bet.category,
      bet_type: bet.betType,
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

  async createBet(bet: Omit<Bet, 'id'>): Promise<Bet> {
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
    if (updates.status) updateData.status = updates.status;
    if (updates.date) updateData.date = updates.date;
    if (updates.selections) updateData.selections = updates.selections;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.category) updateData.category = updates.category;
    if (updates.betType) updateData.bet_type = updates.betType;

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
  subscribeToBets(callback: (bet: Bet) => void) {
    return supabase
      .channel('bets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bets' },
        (payload) => {
          callback(this.mapRowToBet(payload.new as BetRow));
        }
      )
      .subscribe();
  }
}

export default new BetService();
