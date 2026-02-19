import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bet, BetCategory, BetType, BetStatus } from '../types';

const BETS_KEY = '@betra_bets';

class BetService {
  async getBets(): Promise<Bet[]> {
    const data = await AsyncStorage.getItem(BETS_KEY);
    return data ? JSON.parse(data) : [];
  }

  async getBetById(id: string): Promise<Bet | null> {
    const bets = await this.getBets();
    return bets.find(b => b.id === id) || null;
  }

  async createBet(bet: Omit<Bet, 'id'>): Promise<Bet> {
    const bets = await this.getBets();
    const newBet: Bet = {
      ...bet,
      id: Date.now().toString(),
    };
    await AsyncStorage.setItem(BETS_KEY, JSON.stringify([newBet, ...bets]));
    return newBet;
  }

  async updateBet(id: string, updates: Partial<Bet>): Promise<void> {
    const bets = await this.getBets();
    const index = bets.findIndex(b => b.id === id);
    if (index !== -1) {
      bets[index] = { ...bets[index], ...updates };
      await AsyncStorage.setItem(BETS_KEY, JSON.stringify(bets));
    }
  }

  async deleteBet(id: string): Promise<void> {
    const bets = await this.getBets();
    await AsyncStorage.setItem(BETS_KEY, JSON.stringify(bets.filter(b => b.id !== id)));
  }

  async updateBetStatus(id: string, status: BetStatus): Promise<void> {
    await this.updateBet(id, { status });
  }
}

export default new BetService();
