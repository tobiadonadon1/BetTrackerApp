import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  PurchasesEntitlementInfo,
  LOG_LEVEL,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { SubscriptionTier } from '../constants/subscriptionPlans';

// RevenueCat API keys
const RC_API_KEY_APPLE = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY || '';
const RC_API_KEY_GOOGLE = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY || '';

// RevenueCat entitlement identifiers (must match RevenueCat dashboard)
const ENTITLEMENT_PRO = 'Betra Pro';
const ENTITLEMENT_ELITE = 'Betra Elite';

// Product identifiers (must match RevenueCat dashboard products)
export const PRODUCT_IDS = {
  PRO_MONTHLY: 'betra_pro_monthly',
  PRO_ANNUAL: 'betra_pro_annual',
  ELITE_MONTHLY: 'betra_elite_monthly',
  ELITE_ANNUAL: 'betra_elite_annual',
} as const;

export interface RevenueCatSubscriptionInfo {
  tier: SubscriptionTier;
  isActive: boolean;
  willRenew: boolean;
  expirationDate: Date | null;
  isTrial: boolean;
  trialDaysLeft: number;
}

class RevenueCatService {
  private initialized = false;

  /**
   * Initialize RevenueCat SDK. Must be called once at app startup.
   */
  async initialize(appUserId?: string): Promise<void> {
    if (this.initialized) return;

    const apiKey = Platform.OS === 'ios' ? RC_API_KEY_APPLE : RC_API_KEY_GOOGLE;

    if (!apiKey) {
      console.warn('[RevenueCat] No API key configured for', Platform.OS);
      return;
    }

    try {
      if (__DEV__) {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      }

      Purchases.configure({ apiKey, appUserID: appUserId || undefined });
      this.initialized = true;
      console.log('[RevenueCat] Initialized successfully');
    } catch (error) {
      console.error('[RevenueCat] Initialization failed:', error);
    }
  }

  /**
   * Identify a user (call after login)
   */
  async login(appUserId: string): Promise<void> {
    if (!this.initialized) return;
    try {
      await Purchases.logIn(appUserId);
    } catch (error) {
      console.error('[RevenueCat] Login failed:', error);
    }
  }

  /**
   * Log out the current user (call on sign out)
   */
  async logout(): Promise<void> {
    if (!this.initialized) return;
    try {
      await Purchases.logOut();
    } catch (error) {
      console.error('[RevenueCat] Logout failed:', error);
    }
  }

  /**
   * Get the current customer subscription info
   */
  async getSubscriptionInfo(): Promise<RevenueCatSubscriptionInfo> {
    if (!this.initialized) {
      return this.defaultFreeInfo();
    }

    try {
      const customerInfo = await Purchases.getCustomerInfo();
      return this.mapCustomerInfoToSubscription(customerInfo);
    } catch (error) {
      console.warn('[RevenueCat] Failed to get customer info:', error);
      return this.defaultFreeInfo();
    }
  }

  /**
   * Get available subscription packages (offerings)
   */
  async getPackages(): Promise<PurchasesPackage[]> {
    if (!this.initialized) return [];

    try {
      const offerings = await Purchases.getOfferings();
      const current = offerings.current;
      if (!current) {
        console.warn('[RevenueCat] No current offering configured');
        return [];
      }
      return current.availablePackages;
    } catch (error) {
      console.error('[RevenueCat] Failed to get offerings:', error);
      return [];
    }
  }

  /**
   * Purchase a subscription package
   */
  async purchasePackage(pkg: PurchasesPackage): Promise<RevenueCatSubscriptionInfo> {
    if (!this.initialized) {
      throw new Error('RevenueCat not initialized');
    }

    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return this.mapCustomerInfoToSubscription(customerInfo);
    } catch (error: any) {
      if (error.userCancelled) {
        throw new Error('Purchase cancelled');
      }
      throw error;
    }
  }

  /**
   * Restore previous purchases (e.g. after reinstall or device change)
   */
  async restorePurchases(): Promise<RevenueCatSubscriptionInfo> {
    if (!this.initialized) {
      return this.defaultFreeInfo();
    }

    try {
      const customerInfo = await Purchases.restorePurchases();
      return this.mapCustomerInfoToSubscription(customerInfo);
    } catch (error) {
      console.error('[RevenueCat] Restore failed:', error);
      throw error;
    }
  }

  /**
   * Listen for subscription changes
   */
  addCustomerInfoUpdateListener(
    callback: (info: RevenueCatSubscriptionInfo) => void,
  ): () => void {
    if (!this.initialized) return () => {};

    const listener = (customerInfo: CustomerInfo) => {
      callback(this.mapCustomerInfoToSubscription(customerInfo));
    };

    Purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }

  /**
   * Map RevenueCat's CustomerInfo to our app's subscription model
   */
  private mapCustomerInfoToSubscription(info: CustomerInfo): RevenueCatSubscriptionInfo {
    // Check entitlements — Elite takes priority over Pro
    const eliteEntitlement = info.entitlements.active[ENTITLEMENT_ELITE];
    const proEntitlement = info.entitlements.active[ENTITLEMENT_PRO];

    const activeEntitlement: PurchasesEntitlementInfo | undefined =
      eliteEntitlement || proEntitlement;

    if (!activeEntitlement) {
      return this.defaultFreeInfo();
    }

    const tier: SubscriptionTier = eliteEntitlement ? 'elite' : 'pro';
    const expirationDate = activeEntitlement.expirationDate
      ? new Date(activeEntitlement.expirationDate)
      : null;

    const now = new Date();
    const isTrial = activeEntitlement.periodType === 'TRIAL';
    const trialDaysLeft = isTrial && expirationDate
      ? Math.max(0, Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    return {
      tier,
      isActive: activeEntitlement.isActive,
      willRenew: activeEntitlement.willRenew,
      expirationDate,
      isTrial,
      trialDaysLeft,
    };
  }

  private defaultFreeInfo(): RevenueCatSubscriptionInfo {
    return {
      tier: 'free',
      isActive: false,
      willRenew: false,
      expirationDate: null,
      isTrial: false,
      trialDaysLeft: 0,
    };
  }
}

export default new RevenueCatService();
