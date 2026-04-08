export type SubscriptionTier = 'free' | 'pro' | 'elite';
export type BillingPeriod = 'monthly' | 'annual';

export interface TierConfig {
  tier: SubscriptionTier;
  name: string;
  priceMonthly: number;      // e.g. 7.99
  priceAnnual: number;       // e.g. 74.99
  priceMonthlyLabel: string; // "€7.99/mo"
  priceAnnualLabel: string;  // "€74.99/yr"
  annualSavings: number;     // percentage saved vs monthly
  maxTickets: number;        // Infinity for pro/elite
  historyDays: number;       // Infinity for pro/elite
  features: string[];        // marketing feature list
  ocrEnabled: boolean;
  advancedAnalytics: boolean;
  bankrollEnabled: boolean;
  streakAnalysis: boolean;
  dataExport: boolean;
  customTags: boolean;
  prioritySupport: boolean;
}

export type FeatureKey = keyof Pick<
  TierConfig,
  'ocrEnabled' | 'advancedAnalytics' | 'bankrollEnabled' | 'streakAnalysis' | 'dataExport' | 'customTags' | 'prioritySupport'
>;

export const FREE_TICKET_LIMIT = 30;
export const FREE_HISTORY_DAYS = 30;
export const TRIAL_DURATION_DAYS = 7;

export const PLANS: Record<SubscriptionTier, TierConfig> = {
  free: {
    tier: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceAnnual: 0,
    priceMonthlyLabel: '€0',
    priceAnnualLabel: '€0',
    annualSavings: 0,
    maxTickets: FREE_TICKET_LIMIT,
    historyDays: FREE_HISTORY_DAYS,
    features: [
      'Manual Bet Entry',
      'Live Score Monitoring',
      'Basic Push Notifications',
      'Basic Statistics (P&L, Win Rate)',
      'Bet History (30 days)',
      'Ticket Storage (30 tickets)',
    ],
    ocrEnabled: false,
    advancedAnalytics: false,
    bankrollEnabled: false,
    streakAnalysis: false,
    dataExport: false,
    customTags: false,
    prioritySupport: false,
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    priceMonthly: 7.99,
    priceAnnual: 74.99,
    priceMonthlyLabel: '€7.99/mo',
    priceAnnualLabel: '€74.99/yr',
    annualSavings: 22,
    maxTickets: Infinity,
    historyDays: Infinity,
    features: [
      'Everything in Free',
      'OCR Bet Scanning',
      'Unlimited Bet History',
      'Unlimited Ticket Storage',
      'Advanced Analytics Dashboard',
      'Performance Over Time Charts',
      'Multi-Sportsbook Analytics',
      'Average Odds & Exposure Tracking',
      'Advanced Push Notifications',
    ],
    ocrEnabled: true,
    advancedAnalytics: true,
    bankrollEnabled: false,
    streakAnalysis: false,
    dataExport: false,
    customTags: false,
    prioritySupport: false,
  },
  elite: {
    tier: 'elite',
    name: 'Elite',
    priceMonthly: 17.99,
    priceAnnual: 149.99,
    priceMonthlyLabel: '€17.99/mo',
    priceAnnualLabel: '€149.99/yr',
    annualSavings: 31,
    maxTickets: Infinity,
    historyDays: Infinity,
    features: [
      'Everything in Pro',
      'Bankroll Management Module',
      'Streak & Pattern Analysis',
      'ROI Trend Analysis (Rolling)',
      'Data Export (CSV / PDF)',
      'Custom Tags & Categories',
      'Early Access to New Features',
      'Priority Support',
    ],
    ocrEnabled: true,
    advancedAnalytics: true,
    bankrollEnabled: true,
    streakAnalysis: true,
    dataExport: true,
    customTags: true,
    prioritySupport: true,
  },
};
