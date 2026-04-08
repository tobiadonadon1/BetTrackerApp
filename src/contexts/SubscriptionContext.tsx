import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { PurchasesPackage } from 'react-native-purchases';
import { useAuth } from './AuthContext';
import revenueCatService, { RevenueCatSubscriptionInfo } from '../services/revenueCatService';
import {
  SubscriptionTier,
  FeatureKey,
  TierConfig,
  PLANS,
} from '../constants/subscriptionPlans';

interface SubscriptionContextType {
  /** Effective tier after accounting for trial expiry */
  tier: SubscriptionTier;
  /** Full config for the effective tier */
  limits: TierConfig;
  /** Whether the user is on their free trial */
  isTrial: boolean;
  /** Number of days remaining in trial (0 if expired / not trialing) */
  trialDaysLeft: number;
  /** Raw subscription status */
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  /** Whether the subscription data is still loading */
  loading: boolean;
  /** Check if a specific boolean feature is available */
  canUseFeature: (feature: FeatureKey) => boolean;
  /** Current total ticket count (set externally by BetsProvider) */
  ticketCount: number;
  /** Whether the user has hit the free ticket limit */
  isOverLimit: boolean;
  /** Update the ticket count (called by BetsProvider) */
  setTicketCount: (count: number) => void;
  /** Open the paywall — set paywallReason to explain why */
  openPaywall: (reason?: string) => void;
  /** Close the paywall */
  closePaywall: () => void;
  /** Whether the paywall should be showing */
  paywallVisible: boolean;
  /** Reason string for why the paywall was opened */
  paywallReason: string;
  /** Available RevenueCat packages for purchase */
  packages: PurchasesPackage[];
  /** Purchase a specific package */
  purchasePackage: (pkg: PurchasesPackage) => Promise<void>;
  /** Refresh subscription data / restore purchases */
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType>({} as SubscriptionContextType);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const isGuest = !user || user.id === 'guest';

  const [rcInfo, setRcInfo] = useState<RevenueCatSubscriptionInfo>({
    tier: 'free',
    isActive: false,
    willRenew: false,
    expirationDate: null,
    isTrial: false,
    trialDaysLeft: 0,
  });
  const [loading, setLoading] = useState(true);
  const [ticketCount, setTicketCount] = useState(0);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallReason, setPaywallReason] = useState('');
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);

  // Initialize RevenueCat and load subscription
  useEffect(() => {
    const init = async () => {
      if (isGuest) {
        setRcInfo({
          tier: 'free',
          isActive: false,
          willRenew: false,
          expirationDate: null,
          isTrial: false,
          trialDaysLeft: 0,
        });
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Initialize RevenueCat with the user's Supabase ID
        await revenueCatService.initialize(user?.id);

        // Identify the user
        if (user?.id) {
          await revenueCatService.login(user.id);
        }

        // Load subscription info
        const info = await revenueCatService.getSubscriptionInfo();
        setRcInfo(info);

        // Load available packages
        const pkgs = await revenueCatService.getPackages();
        setPackages(pkgs);
      } catch (err) {
        console.warn('[SubscriptionContext] Init error:', err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [isGuest, user?.id]);

  // Listen for realtime subscription changes
  useEffect(() => {
    if (isGuest) return;

    const unsubscribe = revenueCatService.addCustomerInfoUpdateListener((info) => {
      setRcInfo(info);
    });

    return unsubscribe;
  }, [isGuest]);

  const tier = rcInfo.tier;
  const limits = PLANS[tier];

  // Map RevenueCat status to our status model
  const status = useMemo(() => {
    if (rcInfo.isTrial) return 'trialing' as const;
    if (rcInfo.isActive) return 'active' as const;
    if (!rcInfo.isActive && rcInfo.willRenew) return 'past_due' as const;
    return 'canceled' as const;
  }, [rcInfo]);

  const canUseFeature = useCallback(
    (feature: FeatureKey): boolean => {
      return !!limits[feature];
    },
    [limits],
  );

  const isOverLimit = useMemo(
    () => ticketCount >= limits.maxTickets,
    [ticketCount, limits.maxTickets],
  );

  const openPaywall = useCallback((reason?: string) => {
    setPaywallReason(reason || '');
    setPaywallVisible(true);
  }, []);

  const closePaywall = useCallback(() => {
    setPaywallVisible(false);
    setPaywallReason('');
  }, []);

  const purchasePackageHandler = useCallback(
    async (pkg: PurchasesPackage): Promise<void> => {
      try {
        const info = await revenueCatService.purchasePackage(pkg);
        setRcInfo(info);
        setPaywallVisible(false);
      } catch (error: any) {
        if (error.message === 'Purchase cancelled') {
          // User cancelled — don't throw
          return;
        }
        throw error;
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const info = await revenueCatService.restorePurchases();
      setRcInfo(info);

      // Also refresh packages
      const pkgs = await revenueCatService.getPackages();
      setPackages(pkgs);
    } catch (err) {
      console.warn('[SubscriptionContext] Refresh error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo<SubscriptionContextType>(
    () => ({
      tier,
      limits,
      isTrial: rcInfo.isTrial,
      trialDaysLeft: rcInfo.trialDaysLeft,
      status,
      loading,
      canUseFeature,
      ticketCount,
      isOverLimit,
      setTicketCount,
      openPaywall,
      closePaywall,
      paywallVisible,
      paywallReason,
      packages,
      purchasePackage: purchasePackageHandler,
      refresh,
    }),
    [
      tier,
      limits,
      rcInfo.isTrial,
      rcInfo.trialDaysLeft,
      status,
      loading,
      canUseFeature,
      ticketCount,
      isOverLimit,
      openPaywall,
      closePaywall,
      paywallVisible,
      paywallReason,
      packages,
      purchasePackageHandler,
      refresh,
    ],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
