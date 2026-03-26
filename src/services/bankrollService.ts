import { supabase } from '../config/supabase';

export interface BankrollSettings {
  id: string;
  userId: string;
  initialBankroll: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankrollHistoryEntry {
  id: string;
  userId: string;
  date: string;
  balance: number;
  snapshotType: 'initial' | 'settled' | 'manual';
  betId: string | null;
  createdAt: string;
}

class BankrollService {
  private async getUserId(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Not authenticated');
    return session.user.id;
  }

  async getSettings(): Promise<BankrollSettings | null> {
    const userId = await this.getUserId();

    const { data, error } = await supabase
      .from('bankroll_settings')
      .select('*')
      .eq('user_id', userId)
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    const row = data?.[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.user_id,
      initialBankroll: Number(row.initial_bankroll),
      currency: row.currency,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async saveSettings(initialBankroll: number, currency: string = 'USD'): Promise<BankrollSettings> {
    const userId = await this.getUserId();

    // Upsert settings
    const { data, error } = await supabase
      .from('bankroll_settings')
      .upsert({
        user_id: userId,
        initial_bankroll: initialBankroll,
        currency,
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Check if initial history entry exists
    const { data: existingInitial } = await supabase
      .from('bankroll_history')
      .select('id')
      .eq('user_id', userId)
      .eq('snapshot_type', 'initial')
      .limit(1);

    if (!existingInitial || existingInitial.length === 0) {
      // Create initial history entry
      await supabase
        .from('bankroll_history')
        .insert({
          user_id: userId,
          date: new Date().toISOString().split('T')[0],
          balance: initialBankroll,
          snapshot_type: 'initial',
          bet_id: null,
        });
    } else {
      // Update initial entry balance
      await supabase
        .from('bankroll_history')
        .update({ balance: initialBankroll })
        .eq('user_id', userId)
        .eq('snapshot_type', 'initial');
    }

    return {
      id: data.id,
      userId: data.user_id,
      initialBankroll: Number(data.initial_bankroll),
      currency: data.currency,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getHistory(): Promise<BankrollHistoryEntry[]> {
    const userId = await this.getUserId();

    const { data, error } = await supabase
      .from('bankroll_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    return (data || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      date: row.date,
      balance: Number(row.balance),
      snapshotType: row.snapshot_type as 'initial' | 'settled' | 'manual',
      betId: row.bet_id,
      createdAt: row.created_at,
    }));
  }

  async getCurrentBalance(): Promise<number | null> {
    const userId = await this.getUserId();

    const { data, error } = await supabase
      .from('bankroll_history')
      .select('balance')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    return data?.length ? Number(data[0].balance) : null;
  }

  async recordBetSettlement(betId: string, profitOrLoss: number): Promise<void> {
    const userId = await this.getUserId();

    // Get current balance
    const currentBalance = await this.getCurrentBalance();
    if (currentBalance === null) return; // No bankroll configured

    const newBalance = currentBalance + profitOrLoss;

    const { error } = await supabase
      .from('bankroll_history')
      .insert({
        user_id: userId,
        date: new Date().toISOString().split('T')[0],
        balance: newBalance,
        snapshot_type: 'settled',
        bet_id: betId,
      });

    if (error) throw new Error(error.message);
  }

  async deleteAll(): Promise<void> {
    const userId = await this.getUserId();

    await supabase
      .from('bankroll_history')
      .delete()
      .eq('user_id', userId);

    await supabase
      .from('bankroll_settings')
      .delete()
      .eq('user_id', userId);
  }
}

export default new BankrollService();
