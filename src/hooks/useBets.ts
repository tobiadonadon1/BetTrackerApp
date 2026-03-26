import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import betService, { BetRealtimeChange } from '../services/betService';
import bankrollService from '../services/bankrollService';
import { useAuth } from '../contexts/AuthContext';
import { Bet, BetStatus } from '../types';
import { useMatchResults } from './useMatchResults';

interface UpdateBetOptions {
  trackBankroll?: boolean;
}

interface BetsContextType {
  bets: Bet[];
  loading: boolean;
  error: string | null;
  createBet: (bet: Omit<Bet, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Bet>;
  updateStatus: (id: string, status: BetStatus) => Promise<void>;
  deleteBet: (id: string) => Promise<void>;
  updateBet: (id: string, updates: Partial<Bet>, options?: UpdateBetOptions) => Promise<void>;
  refresh: () => Promise<void>;
  fetchBetById: (id: string) => Promise<Bet | null>;
}

const BetsContext = createContext<BetsContextType | undefined>(undefined);

function resolveOverallStatus(selections: Bet['selections']): BetStatus {
  if (!selections.length) return 'pending';
  const allResolved = selections.every(selection => selection.status !== 'pending');
  if (!allResolved) return 'pending';
  if (selections.some(selection => selection.status === 'lost')) return 'lost';
  if (selections.every(selection => selection.status === 'won' || selection.status === 'void')) return 'won';
  return 'pending';
}

export function BetsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isGuest = !user || user.id === 'guest';
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const autoResolvingRef = useRef<Set<string>>(new Set());

  const recordBankrollChange = useCallback(async (bet: Bet, newStatus: BetStatus) => {
    if (newStatus !== 'won' && newStatus !== 'lost') return;
    try {
      const profitOrLoss = newStatus === 'won'
        ? bet.potentialWin - bet.stake
        : -bet.stake;
      await bankrollService.recordBetSettlement(bet.id, profitOrLoss);
    } catch {
      // Bankroll snapshots are secondary to bet persistence.
    }
  }, []);

  const mergeBet = useCallback((bet: Bet) => {
    setBets(prev => {
      const exists = prev.find(item => item.id === bet.id);
      if (exists) {
        return prev.map(item => item.id === bet.id ? bet : item);
      }
      return [bet, ...prev];
    });
  }, []);

  const loadBets = useCallback(async () => {
    if (isGuest) {
      setBets([]);
      setLoading(false);
      return;
    }

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
  }, [isGuest]);

  const fetchBetById = useCallback(async (id: string) => {
    if (isGuest) return null;

    const existing = bets.find(bet => bet.id === id);
    if (existing) return existing;

    try {
      setError(null);
      const bet = await betService.getBetById(id);
      if (bet) mergeBet(bet);
      return bet;
    } catch (err: any) {
      setError(err.message || 'Failed to load bet');
      throw err;
    }
  }, [bets, isGuest, mergeBet]);

  useEffect(() => {
    loadBets();

    if (isGuest) return;

    const subscription = betService.subscribeToBets((change: BetRealtimeChange) => {
      setBets(prev => {
        if (change.eventType === 'DELETE' && change.betId) {
          return prev.filter(bet => bet.id !== change.betId);
        }

        if (!change.bet) {
          return prev;
        }

        const exists = prev.find(bet => bet.id === change.bet!.id);
        if (exists) {
          return prev.map(bet => bet.id === change.bet!.id ? change.bet! : bet);
        }

        return [change.bet, ...prev];
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isGuest, loadBets]);

  const applyBetUpdate = useCallback(async (
    id: string,
    updates: Partial<Bet>,
    options?: UpdateBetOptions,
  ) => {
    if (isGuest) throw new Error('Sign in to update bets');

    const currentBet = bets.find(bet => bet.id === id);

    try {
      setError(null);
      await betService.updateBet(id, updates);

      setBets(prev => prev.map(bet => bet.id === id ? { ...bet, ...updates } : bet));

      if (
        options?.trackBankroll !== false &&
        currentBet &&
        currentBet.status === 'pending' &&
        updates.status &&
        updates.status !== 'pending'
      ) {
        await recordBankrollChange(currentBet, updates.status);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update bet');
      throw err;
    }
  }, [bets, isGuest, recordBankrollChange]);

  const createBet = useCallback(async (bet: Omit<Bet, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (isGuest) {
      const err = new Error('Sign in to save bets');
      setError(err.message);
      throw err;
    }

    try {
      setError(null);
      const newBet = await betService.createBet(bet);
      mergeBet(newBet);
      return newBet;
    } catch (err: any) {
      setError(err.message || 'Failed to create bet');
      throw err;
    }
  }, [isGuest, mergeBet]);

  const updateStatus = useCallback(async (id: string, status: BetStatus) => {
    await applyBetUpdate(id, { status });
  }, [applyBetUpdate]);

  const deleteBet = useCallback(async (id: string) => {
    if (isGuest) throw new Error('Sign in to delete bets');

    try {
      setError(null);
      await betService.deleteBet(id);
      setBets(prev => prev.filter(bet => bet.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete bet');
      throw err;
    }
  }, [isGuest]);

  const { getInfo } = useMatchResults(bets);

  useEffect(() => {
    if (isGuest || bets.length === 0) return;

    bets.forEach((bet) => {
      if (!bet.selections?.length || bet.status !== 'pending') return;
      if (autoResolvingRef.current.has(bet.id)) return;

      const updatedSelections = bet.selections.map((selection, index) => {
        if (selection.status !== 'pending') return selection;
        const outcome = getInfo(bet.id, index).resolvedOutcome;
        if (!outcome) return selection;
        return { ...selection, status: outcome };
      });

      const changed = updatedSelections.some((selection, index) => selection.status !== bet.selections[index].status);
      if (!changed) return;

      const nextStatus = resolveOverallStatus(updatedSelections);
      autoResolvingRef.current.add(bet.id);

      applyBetUpdate(
        bet.id,
        { selections: updatedSelections, status: nextStatus },
        { trackBankroll: nextStatus !== 'pending' },
      ).finally(() => {
        autoResolvingRef.current.delete(bet.id);
      });
    });
  }, [applyBetUpdate, bets, getInfo, isGuest]);

  const value = useMemo<BetsContextType>(() => ({
    bets,
    loading,
    error,
    createBet,
    updateStatus,
    deleteBet,
    updateBet: applyBetUpdate,
    refresh: loadBets,
    fetchBetById,
  }), [
    applyBetUpdate,
    bets,
    createBet,
    deleteBet,
    error,
    fetchBetById,
    loadBets,
    loading,
    updateStatus,
  ]);

  return React.createElement(BetsContext.Provider, { value }, children);
}

export function useBets() {
  const context = useContext(BetsContext);
  if (!context) {
    throw new Error('useBets must be used within a BetsProvider');
  }
  return context;
}
