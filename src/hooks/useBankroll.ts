import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import bankrollService, { BankrollSettings, BankrollHistoryEntry } from '../services/bankrollService';

export function useBankroll() {
  const { user } = useAuth();
  const isGuest = !user || user.id === 'guest';
  const [settings, setSettings] = useState<BankrollSettings | null>(null);
  const [history, setHistory] = useState<BankrollHistoryEntry[]>([]);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (isGuest) {
      setSettings(null);
      setHistory([]);
      setCurrentBalance(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [s, h, b] = await Promise.all([
        bankrollService.getSettings(),
        bankrollService.getHistory(),
        bankrollService.getCurrentBalance(),
      ]);
      setSettings(s);
      setHistory(h);
      setCurrentBalance(b);
    } catch {
      // Silently fail — tables may not exist yet
      setSettings(null);
      setHistory([]);
      setCurrentBalance(null);
    } finally {
      setLoading(false);
    }
  }, [isGuest]);

  useEffect(() => {
    load();
  }, [load]);

  const saveBankroll = useCallback(async (initialBankroll: number, currency?: string) => {
    if (isGuest) throw new Error('Sign in to set bankroll');
    const saved = await bankrollService.saveSettings(initialBankroll, currency);
    setSettings(saved);
    setCurrentBalance(initialBankroll);
    await load();
    return saved;
  }, [isGuest, load]);

  const recordSettlement = useCallback(async (betId: string, profitOrLoss: number) => {
    if (isGuest || !settings) return;
    try {
      await bankrollService.recordBetSettlement(betId, profitOrLoss);
      // Refresh balance
      const newBalance = await bankrollService.getCurrentBalance();
      setCurrentBalance(newBalance);
      const newHistory = await bankrollService.getHistory();
      setHistory(newHistory);
    } catch {
      // Non-critical — don't break bet flow
    }
  }, [isGuest, settings]);

  const isConfigured = settings !== null && settings.initialBankroll > 0;

  const changePercent = isConfigured && settings && currentBalance !== null
    ? ((currentBalance - settings.initialBankroll) / settings.initialBankroll) * 100
    : 0;

  const unitSize1Pct = currentBalance !== null ? currentBalance * 0.01 : 0;
  const unitSize2Pct = currentBalance !== null ? currentBalance * 0.02 : 0;

  return {
    settings,
    history,
    currentBalance,
    loading,
    isConfigured,
    changePercent,
    unitSize1Pct,
    unitSize2Pct,
    saveBankroll,
    recordSettlement,
    refresh: load,
  };
}
