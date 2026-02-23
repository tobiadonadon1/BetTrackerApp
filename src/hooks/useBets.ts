import { useState, useEffect, useCallback } from 'react';
import betService from '../services/betService';
import { supabase } from '../config/supabase';
import { Bet, BetStatus } from '../types';

export function useBets() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await betService.getBets();
      setBets(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load bets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBets();

    // Subscribe to real-time changes
    const subscription = betService.subscribeToBets((updatedBet) => {
      setBets(prev => {
        const exists = prev.find(b => b.id === updatedBet.id);
        if (exists) {
          return prev.map(b => b.id === updatedBet.id ? updatedBet : b);
        }
        return [updatedBet, ...prev];
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadBets]);

  const createBet = useCallback(async (bet: Omit<Bet, 'id'>) => {
    try {
      setError(null);
      const newBet = await betService.createBet(bet);
      setBets(prev => [newBet, ...prev]);
      return newBet;
    } catch (err: any) {
      setError(err.message || 'Failed to create bet');
      throw err;
    }
  }, []);

  const updateStatus = useCallback(async (id: string, status: BetStatus) => {
    try {
      setError(null);
      await betService.updateBetStatus(id, status);
      setBets(prev => prev.map(b => b.id === id ? { ...b, status } : b));
    } catch (err: any) {
      setError(err.message || 'Failed to update bet');
      throw err;
    }
  }, []);

  const deleteBet = useCallback(async (id: string) => {
    try {
      setError(null);
      await betService.deleteBet(id);
      setBets(prev => prev.filter(b => b.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete bet');
      throw err;
    }
  }, []);

  const updateBet = useCallback(async (id: string, updates: Partial<Bet>) => {
    try {
      setError(null);
      await betService.updateBet(id, updates);
      setBets(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    } catch (err: any) {
      setError(err.message || 'Failed to update bet');
      throw err;
    }
  }, []);

  return { 
    bets, 
    loading, 
    error,
    createBet, 
    updateStatus, 
    deleteBet,
    updateBet,
    refresh: loadBets 
  };
}
