import { useState, useEffect, useCallback } from 'react';
import betService from '../services/betService';
import { Bet, BetStatus } from '../types';

export function useBets() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBets = useCallback(async () => {
    setLoading(true);
    const data = await betService.getBets();
    setBets(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBets();
  }, [loadBets]);

  const createBet = useCallback(async (bet: Omit<Bet, 'id'>) => {
    const newBet = await betService.createBet(bet);
    setBets(prev => [newBet, ...prev]);
    return newBet;
  }, []);

  const updateStatus = useCallback(async (id: string, status: BetStatus) => {
    await betService.updateBetStatus(id, status);
    setBets(prev => prev.map(b => b.id === id ? { ...b, status } : b));
  }, []);

  const deleteBet = useCallback(async (id: string) => {
    await betService.deleteBet(id);
    setBets(prev => prev.filter(b => b.id !== id));
  }, []);

  return { bets, loading, createBet, updateStatus, deleteBet, refresh: loadBets };
}
