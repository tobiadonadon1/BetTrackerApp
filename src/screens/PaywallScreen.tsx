import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { useSubscription } from '../hooks';
import { SubscriptionTier, BillingPeriod, PLANS, TierConfig } from '../constants/subscriptionPlans';
import { useTranslation } from '../contexts/LanguageContext';
import { PRODUCT_IDS } from '../services/revenueCatService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PaywallScreenProps {
  visible: boolean;
  onClose: () => void;
  reason?: string;
}

const FEATURE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'Manual Bet Entry': 'create-outline',
  'Live Score Monitoring': 'pulse-outline',
  'Basic Push Notifications': 'notifications-outline',
  'Basic Statistics (P&L, Win Rate)': 'stats-chart-outline',
  'Bet History (30 days)': 'time-outline',
  'Ticket Storage (30 tickets)': 'receipt-outline',
  'Everything in Free': 'checkmark-done-outline',
  'OCR Bet Scanning': 'camera-outline',
  'Unlimited Bet History': 'infinite-outline',
  'Unlimited Ticket Storage': 'file-tray-full-outline',
  'Advanced Analytics Dashboard': 'analytics-outline',
  'Performance Over Time Charts': 'trending-up-outline',
  'Multi-Sportsbook Analytics': 'business-outline',
  'Average Odds & Exposure Tracking': 'calculator-outline',
  'Advanced Push Notifications': 'notifications-outline',
  'Everything in Pro': 'checkmark-done-outline',
  'Bankroll Management Module': 'wallet-outline',
  'Streak & Pattern Analysis': 'flash-outline',
  'ROI Trend Analysis (Rolling)': 'bar-chart-outline',
  'Data Export (CSV / PDF)': 'download-outline',
  'Custom Tags & Categories': 'pricetags-outline',
  'Early Access to New Features': 'rocket-outline',
  'Priority Support': 'headset-outline',
};

export default function PaywallScreen({ visible, onClose, reason }: PaywallScreenProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { tier: currentTier, isTrial, trialDaysLeft, packages, purchasePackage, refresh } = useSubscription();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [loadingTier, setLoadingTier] = useState<SubscriptionTier | null>(null);

  // Map tier + period to RevenueCat product ID
  const getProductId = (targetTier: SubscriptionTier, period: BillingPeriod): string | null => {
    if (targetTier === 'pro' && period === 'monthly') return PRODUCT_IDS.PRO_MONTHLY;
    if (targetTier === 'pro' && period === 'annual') return PRODUCT_IDS.PRO_ANNUAL;
    if (targetTier === 'elite' && period === 'monthly') return PRODUCT_IDS.ELITE_MONTHLY;
    if (targetTier === 'elite' && period === 'annual') return PRODUCT_IDS.ELITE_ANNUAL;
    return null;
  };

  const handleUpgrade = useCallback(async (targetTier: SubscriptionTier) => {
    if (targetTier === 'free') {
      onClose();
      return;
    }

    const productId = getProductId(targetTier, billingPeriod);
    if (!productId) {
      Alert.alert('Error', 'No product configured for this plan.');
      return;
    }

    // Find the matching RevenueCat package
    const pkg = packages.find(p => p.product.identifier === productId);
    if (!pkg) {
      Alert.alert('Unavailable', 'This subscription is not yet available. Please try again later.');
      return;
    }

    setLoadingTier(targetTier);
    try {
      await purchasePackage(pkg);
      if (Platform.OS === 'web') {
        window.alert('Success! Your subscription is now active.');
      } else {
        Alert.alert('Success', 'Your subscription is now active!');
      }
      onClose();
    } catch (err: any) {
      const msg = err.message || 'Purchase failed';
      if (msg !== 'Purchase cancelled') {
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Purchase Error', msg);
        }
      }
    } finally {
      setLoadingTier(null);
    }
  }, [billingPeriod, packages, purchasePackage, onClose]);

  const getPrice = (plan: TierConfig) => {
    if (plan.tier === 'free') return '€0';
    if (billingPeriod === 'annual') {
      const monthlyEquiv = (plan.priceAnnual / 12).toFixed(2);
      return `€${monthlyEquiv}`;
    }
    return `€${plan.priceMonthly.toFixed(2)}`;
  };

  const getPriceSuffix = (plan: TierConfig) => {
    if (plan.tier === 'free') return '/forever';
    return '/mo';
  };

  const getBilledLabel = (plan: TierConfig) => {
    if (plan.tier === 'free') return '';
    if (billingPeriod === 'annual') {
      return `Billed €${plan.priceAnnual}/year · Save ${plan.annualSavings}%`;
    }
    return `Billed monthly`;
  };

  const getCtaLabel = (plan: TierConfig) => {
    if (plan.tier === currentTier) return 'Current Plan';
    if (plan.tier === 'free') return 'Downgrade';
    return `Upgrade to ${plan.name}`;
  };

  const isCurrentPlan = (plan: TierConfig) => plan.tier === currentTier;
  const isHigherTier = (plan: TierConfig) => {
    const order: SubscriptionTier[] = ['free', 'pro', 'elite'];
    return order.indexOf(plan.tier) > order.indexOf(currentTier);
  };

  const renderPlanCard = (plan: TierConfig, highlight: boolean) => {
    const isCurrent = isCurrentPlan(plan);
    const isUpgrade = isHigherTier(plan);

    return (
      <View
        key={plan.tier}
        style={[
          styles.planCard,
          highlight && styles.planCardHighlight,
          isCurrent && styles.planCardCurrent,
        ]}
      >
        {highlight && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
          </View>
        )}

        {isCurrent && (
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>
              {isTrial ? `TRIAL · ${trialDaysLeft}d left` : 'CURRENT'}
            </Text>
          </View>
        )}

        <Text style={styles.planName}>{plan.name}</Text>

        <View style={styles.priceRow}>
          <Text style={styles.priceValue}>{getPrice(plan)}</Text>
          <Text style={styles.priceSuffix}>{getPriceSuffix(plan)}</Text>
        </View>

        {getBilledLabel(plan) ? (
          <Text style={styles.billedLabel}>{getBilledLabel(plan)}</Text>
        ) : null}

        <View style={styles.featureList}>
          {plan.features.map((feature, i) => (
            <View key={i} style={styles.featureRow}>
              <Ionicons
                name={FEATURE_ICONS[feature] || 'checkmark-circle-outline'}
                size={15}
                color={highlight ? colors.accent : colors.textSecondary}
              />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.ctaButton,
            isCurrent && styles.ctaButtonDisabled,
            isUpgrade && styles.ctaButtonUpgrade,
            !isUpgrade && !isCurrent && styles.ctaButtonDowngrade,
          ]}
          onPress={() => handleUpgrade(plan.tier)}
          disabled={isCurrent || loadingTier !== null}
        >
          {loadingTier === plan.tier ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text
              style={[
                styles.ctaButtonText,
                isCurrent && styles.ctaButtonTextDisabled,
              ]}
            >
              {getCtaLabel(plan)}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 20) }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Choose Your Plan</Text>
          <View style={{ width: 42 }} />
        </View>

        {/* Reason banner */}
        {reason ? (
          <View style={styles.reasonBanner}>
            <Ionicons name="lock-closed" size={16} color="#FBBF24" />
            <Text style={styles.reasonText}>{reason}</Text>
          </View>
        ) : null}

        {/* Trial banner */}
        {isTrial && (
          <View style={styles.trialBanner}>
            <Ionicons name="time-outline" size={16} color={colors.accent} />
            <Text style={styles.trialText}>
              Pro trial: {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining
            </Text>
          </View>
        )}

        {/* Billing toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleButton, billingPeriod === 'monthly' && styles.toggleActive]}
            onPress={() => setBillingPeriod('monthly')}
          >
            <Text style={[styles.toggleText, billingPeriod === 'monthly' && styles.toggleTextActive]}>
              Monthly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, billingPeriod === 'annual' && styles.toggleActive]}
            onPress={() => setBillingPeriod('annual')}
          >
            <Text style={[styles.toggleText, billingPeriod === 'annual' && styles.toggleTextActive]}>
              Annual
            </Text>
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>SAVE</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Plans */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {renderPlanCard(PLANS.free, false)}
          {renderPlanCard(PLANS.pro, true)}
          {renderPlanCard(PLANS.elite, false)}

          {/* Restore purchase */}
          <TouchableOpacity style={styles.restoreButton} onPress={async () => {
            try {
              await refresh();
              if (Platform.OS === 'web') {
                window.alert('Restored: Your subscription has been refreshed.');
              } else {
                Alert.alert('Restored', 'Your subscription has been refreshed.');
              }
            } catch (error) {
              // Ignore failure silently
            }
          }}>
            <Text style={styles.restoreText}>Restore Purchase</Text>
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            {Platform.OS === 'ios'
              ? 'Payment will be charged to your Apple ID account. Subscriptions auto-renew unless canceled at least 24 hours before the end of the current period. Manage subscriptions in Settings > Apple ID > Subscriptions.'
              : 'Payment will be charged to your Google Play account. Subscriptions auto-renew unless canceled at least 24 hours before the end of the current period. Manage subscriptions in Google Play Store > Subscriptions.'}
          </Text>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  reasonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.2)',
    gap: 8,
  },
  reasonText: {
    flex: 1,
    fontSize: 13,
    color: '#FBBF24',
    fontWeight: '600',
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(74, 159, 212, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(74, 159, 212, 0.2)',
    gap: 8,
  },
  trialText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(27, 56, 102, 0.5)',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(99, 130, 180, 0.1)',
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  toggleActive: {
    backgroundColor: 'rgba(74, 159, 212, 0.2)',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: colors.accent,
  },
  saveBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  saveBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  planCard: {
    backgroundColor: 'rgba(22, 42, 78, 0.85)',
    borderRadius: 18,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(99, 130, 180, 0.1)',
  },
  planCardHighlight: {
    borderColor: colors.accent,
    borderWidth: 1.5,
    backgroundColor: 'rgba(22, 42, 78, 0.95)',
  },
  planCardCurrent: {
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -52,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  popularBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  currentBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success,
    letterSpacing: 0.5,
  },
  planName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  priceSuffix: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    marginLeft: 2,
  },
  billedLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 14,
  },
  featureList: {
    marginBottom: 16,
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  ctaButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(74, 159, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(74, 159, 212, 0.3)',
  },
  ctaButtonUpgrade: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  ctaButtonDowngrade: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  ctaButtonDisabled: {
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderColor: 'rgba(74, 222, 128, 0.2)',
  },
  ctaButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  ctaButtonTextDisabled: {
    color: colors.success,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  restoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  disclaimer: {
    fontSize: 11,
    color: 'rgba(176, 198, 228, 0.4)',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
    paddingHorizontal: 8,
  },
});
