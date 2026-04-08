import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { useBets, useBankroll, useMatchResults, useSubscription } from '../hooks';
import { useTranslation } from '../contexts/LanguageContext';
import AppBackground from '../components/AppBackground';
import PageHeader from '../components/PageHeader';
import { Bet, BetStatus, BetCategory } from '../types';
import { formatOddsWithAt } from '../utils/odds';
import { formatBetDate, getSourceLabel } from '../utils/betFormatting';
import { navigationRef } from '../services/notificationService';
import OverUnderProgressBar from '../components/OverUnderProgressBar';

/** BetDetail lives on the root stack; Home is inside tabs — use parent or global ref. */
function navigateToBetDetail(navigation: { getParent?: () => any; navigate: (a: string, p?: object) => void }, betId: string, selectionIndex: number) {
  const params = { betId, selectionIndex };
  try {
    const parent = typeof navigation.getParent === 'function' ? navigation.getParent() : null;
    if (parent?.navigate) {
      parent.navigate('BetDetail', params);
      return;
    }
  } catch {
    /* ignore */
  }
  if (navigationRef.isReady()) {
    navigationRef.navigate('BetDetail', params);
    return;
  }
  navigation.navigate('BetDetail', params);
}

interface HomeScreenProps {
  navigation: any;
}

function parseEventString(event: string) {
  const parts = event.split(' — ');
  if (parts.length >= 3) {
    return { league: parts[0].trim(), matchTitle: parts[1].trim(), matchTime: parts[2].trim() };
  }
  if (parts.length === 2) {
    if (parts[1].toLowerCase().includes(' vs ') || parts[1].includes(' - ')) {
      return { league: parts[0].trim(), matchTitle: parts[1].trim(), matchTime: '' };
    }
    return { league: '', matchTitle: parts[0].trim(), matchTime: parts[1].trim() };
  }
  return { league: '', matchTitle: event.trim(), matchTime: '' };
}

function fallbackBadge(status: BetStatus) {
  switch (status) {
    case 'won': return { label: 'WON', accent: '#4ADE80', bg: 'rgba(74,222,128,0.15)', text: '#4ADE80' };
    case 'lost': return { label: 'LOST', accent: '#EF4444', bg: 'rgba(239,68,68,0.15)', text: '#EF4444' };
    case 'void': return { label: 'VOID', accent: '#6B8CAE', bg: 'rgba(107,140,174,0.15)', text: '#6B8CAE' };
    default: return { label: '…', accent: '#60A5FA', bg: 'rgba(96,165,250,0.12)', text: '#93C5FD' };
  }
}

function parlayProgressBadge(bet: Bet) {
  if (bet.status === 'won' || bet.status === 'lost' || bet.status === 'void') {
    return fallbackBadge(bet.status);
  }
  const totalLegs = bet.selections?.length || 0;
  const settledLegs = bet.selections?.filter(s => s.status !== 'pending').length || 0;
  // Use t('parlay') or hardcoded 'PARLAY' if translation not available easily. It's used outside component so we must pass translation in or resolve softly.
  const label = totalLegs > 0 ? `${settledLegs}/${totalLegs}` : 'PARLAY';
  return {
    label,
    accent: colors.accent,
    bg: 'rgba(74,159,212,0.12)',
    text: colors.accent,
  };
}

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const { bets, loading, refresh, updateBet } = useBets();
  const { isConfigured: bankrollConfigured, currentBalance, changePercent, unitSize1Pct, unitSize2Pct } = useBankroll();
  const { getInfo, loading: matchLoading, refresh: refreshMatches } = useMatchResults(bets);
  const { t } = useTranslation();
  const { tier, limits, isTrial, trialDaysLeft, setTicketCount, openPaywall } = useSubscription();
  const [activeTab, setActiveTab] = useState<'recent' | 'archive'>('recent');
  const [expandedParlays, setExpandedParlays] = useState<Record<string, boolean>>({});

  const handleRefresh = useCallback(() => {
    refresh();
    refreshMatches();
  }, [refresh, refreshMatches]);

  const toggleParlay = useCallback((betId: string) => {
    setExpandedParlays(prev => ({ ...prev, [betId]: !prev[betId] }));
  }, []);

  const stats = useMemo(() => {
    let won = 0;
    let lost = 0;
    let total = bets.length;
    for (const b of bets) {
      if (b.status === 'won') won += 1;
      else if (b.status === 'lost') lost += 1;
    }
    const decided = won + lost;
    const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;
    return { total, won, lost, winRate };
  }, [bets]);

  const decidedWagered = bets.filter(b => b.status === 'won' || b.status === 'lost').reduce((sum, b) => sum + b.stake, 0);
  const wonTickets = bets.filter(b => b.status === 'won');
  const lostTickets = bets.filter(b => b.status === 'lost');
  const totalWonProfit = wonTickets.reduce((sum, b) => sum + (b.potentialWin - b.stake), 0);
  const totalLostStake = lostTickets.reduce((sum, b) => sum + b.stake, 0);
  const netProfit = totalWonProfit - totalLostStake;
  const roi = decidedWagered > 0 ? (netProfit / decidedWagered) * 100 : 0;

  // Sync ticket count with subscription context
  React.useEffect(() => {
    setTicketCount(bets.length);
  }, [bets.length, setTicketCount]);

  // For free-tier users, filter bets to last 30 days
  const thirtyDaysAgo = React.useMemo(() => {
    if (limits.historyDays === Infinity) return null;
    const d = new Date();
    d.setDate(d.getDate() - limits.historyDays);
    return d.toISOString();
  }, [limits.historyDays]);

  const { recentBets, archiveBets } = useMemo(() => {
    const recent: Bet[] = [];
    const archive: Bet[] = [];
    for (const bet of bets) {
      // Apply free-tier 30-day filter
      if (thirtyDaysAgo && bet.date < thirtyDaysAgo) continue;
      if (bet.archived) archive.push(bet);
      else recent.push(bet);
    }
    return { recentBets: recent, archiveBets: archive };
  }, [bets, thirtyDaysAgo]);

  const displayBets = activeTab === 'recent' ? recentBets : archiveBets;
  const recentCount = recentBets.length;
  const archiveCount = archiveBets.length;

  return (
    <View style={styles.container}>
      <AppBackground />
      <PageHeader title={t('appName') || 'BETRA'} subtitle={t('tagline') || 'Track. Analyze. Win.'} />

      {/* Free tier / trial banner */}
      {tier === 'free' && (
        <TouchableOpacity style={styles.upgradeBanner} onPress={() => openPaywall('Upgrade to unlock unlimited history and OCR scanning.')}>
          <Ionicons name="lock-closed" size={14} color="#FBBF24" />
          <Text style={styles.upgradeBannerText}>Free plan: showing last 30 days. Tap to upgrade →</Text>
        </TouchableOpacity>
      )}
      {isTrial && (
        <View style={styles.trialBanner}>
          <Ionicons name="time-outline" size={14} color={colors.accent} />
          <Text style={styles.trialBannerText}>Pro trial: {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining</Text>
        </View>
      )}

      {bankrollConfigured && currentBalance !== null && (
        <View style={styles.bankrollBar}>
          <View style={styles.bankrollBarLeft}>
            <Ionicons name="wallet-outline" size={16} color={colors.accent} />
            <Text style={styles.bankrollBarLabel}>{t('bankroll') || 'Bankroll'}</Text>
          </View>
          <Text style={styles.bankrollBarValue}>${currentBalance.toFixed(0)}</Text>
          <Text style={[styles.bankrollBarChange, { color: changePercent >= 0 ? colors.success : colors.error }]}>
            {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%
          </Text>
          <View style={styles.bankrollBarUnit}>
            <Text style={styles.bankrollBarUnitLabel}>{t('unit') || 'Unit'}</Text>
            <Text style={styles.bankrollBarUnitValue}>${unitSize1Pct.toFixed(0)}-{unitSize2Pct.toFixed(0)}</Text>
          </View>
        </View>
      )}

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statCardValue}>{stats.total}</Text>
          <Text style={styles.statCardLabel}>{t('totalBets') || 'Legs / Bets'}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statCardValue, { color: colors.success }]}>{stats.winRate}%</Text>
          <Text style={styles.statCardLabel}>{t('winRate') || 'Win Rate'}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statCardValue, { color: colors.error }]}>{stats.lost}</Text>
          <Text style={styles.statCardLabel}>{t('losses') || 'Losses'}</Text>
        </View>
      </View>

      <View style={styles.miniStats}>
        <View style={styles.miniStat}>
          <Text style={[styles.miniStatVal, { color: netProfit >= 0 ? '#4ADE80' : '#EF4444' }]}>
            {netProfit >= 0 ? `+$${netProfit.toFixed(0)}` : `-$${Math.abs(netProfit).toFixed(0)}`}
          </Text>
          <Text style={styles.miniStatLbl}>{t('netPL') || 'NET P&L'}</Text>
        </View>
        <View style={styles.miniStat}>
          <Text style={[styles.miniStatVal, { color: roi >= 0 ? '#FBBF24' : colors.error }]}>
            {roi >= 0 ? `+${roi.toFixed(1)}%` : `${roi.toFixed(1)}%`}
          </Text>
          <Text style={styles.miniStatLbl}>{t('roi') || 'ROI'}</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'recent' && styles.tabActive]}
          onPress={() => setActiveTab('recent')}
        >
          <Text style={[styles.tabText, activeTab === 'recent' && styles.tabTextActive]}>
            {t('recent') || 'Recent'}{recentCount > 0 ? ` (${recentCount})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'archive' && styles.tabActive]}
          onPress={() => setActiveTab('archive')}
        >
          <Text style={[styles.tabText, activeTab === 'archive' && styles.tabTextActive]}>
            {t('archive') || 'Archive'}{archiveCount > 0 ? ` (${archiveCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={loading || matchLoading} onRefresh={handleRefresh} tintColor={colors.accent} />
        }
      >
        {displayBets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color={colors.accent} />
            <Text style={styles.emptyTitle}>
              {activeTab === 'recent' ? (t('noBetsYet') || 'No recent bets') : 'No archived bets'}
            </Text>
            {activeTab === 'recent' && (
              <>
                <Text style={styles.emptyText}>{t('addFirstBet') || 'Add your first bet to start tracking'}</Text>
                <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('AddBet')}>
                  <Text style={styles.emptyButtonText}>{t('addBet') || 'Add Bet'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          displayBets.map(bet => {
            const isParlay = bet.betType !== 'single' && (bet.selections?.length || 0) > 1;
            const firstSelection = bet.selections?.[0] || null;
            const parsed = firstSelection ? parseEventString(firstSelection.event) : null;

            let badge = fallbackBadge(bet.status);
            if (isParlay) {
              badge = parlayProgressBadge(bet);
            } else if (firstSelection) {
              const info = getInfo(bet.id, 0);
              badge = { label: info.smartLabel, accent: info.accent, bg: info.bg, text: info.textColor };
            }

            const oddsString = isParlay
              ? formatOddsWithAt(bet.totalOdds, bet.oddsFormat)
              : formatOddsWithAt(firstSelection?.odds || bet.totalOdds, firstSelection?.oddsFormat ?? bet.oddsFormat);

            const stakeLabel = `€${bet.stake.toFixed(0)}`;
            const sourceLabel = getSourceLabel(bet.source);
            const infoLine = [oddsString, stakeLabel, sourceLabel].filter(Boolean).join(' · ');
            const dateLine = formatBetDate(bet.date);
            const leagueLine = isParlay ? (bet.league || '') : (parsed?.league || bet.league || '');
            const titleLine = isParlay ? bet.title : (parsed?.matchTitle || bet.title);
            const pickLine = !isParlay && firstSelection
              ? [
                  firstSelection.selection,
                  (firstSelection.market || bet.market).toUpperCase(),
                ].filter(Boolean).join(' · ')
              : null;
            const profitValue = bet.status === 'won' ? bet.potentialWin - bet.stake : 0;
            const profitStr = !isParlay && profitValue > 0 ? `+€${profitValue.toFixed(2)}` : null;
            const potentialStr = isParlay ? `Potential €${bet.potentialWin.toFixed(2)}` : null;
            const isExpanded = !!expandedParlays[bet.id];

            const parlaySwipeRight = () => {
              const showArchive = activeTab === 'recent';
              return (
                <TouchableOpacity
                  style={[styles.swipeAction, showArchive ? styles.swipeArchive : styles.swipeRestore]}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={showArchive ? t('archiveParlay') || 'Archive parlay' : t('restore') || 'Restore parlay'}
                  onPress={() => {
                    if (showArchive) {
                      void updateBet(bet.id, { archived: true }).then(() => setActiveTab('archive'));
                    } else {
                      void updateBet(bet.id, { archived: false }).then(() => setActiveTab('recent'));
                    }
                  }}
                >
                  <Ionicons
                    name={showArchive ? 'archive-outline' : 'arrow-undo-outline'}
                    size={22}
                    color="rgba(255,255,255,0.95)"
                  />
                  <Text style={styles.swipeActionLabel}>{showArchive ? (t('archive') || 'Archive') : (t('restore') || 'Restore')}</Text>
                </TouchableOpacity>
              );
            };

            const card = (
              <TouchableOpacity
                style={styles.betCard}
                onPress={() => navigateToBetDetail(navigation, bet.id, 0)}
                activeOpacity={0.75}
              >
                <View style={[styles.betAccentBar, { backgroundColor: badge.accent }]} />
                <View style={styles.betContent}>
                  {isParlay && (
                    <View style={styles.parlayHeaderRow}>
                      <Text style={styles.parlayHeaderLabel}>{bet.selections.length} {t('legs') || 'legs'}</Text>
                    </View>
                  )}
                  {leagueLine ? (
                    <Text style={styles.betLeague} numberOfLines={1}>{leagueLine}</Text>
                  ) : null}
                  <Text style={styles.betTitle} numberOfLines={1}>{titleLine}</Text>
                  <Text style={styles.betSubtitle} numberOfLines={1}>{infoLine}</Text>
                  <Text style={styles.betSubtitle} numberOfLines={1}>{dateLine}</Text>
                  {pickLine ? <Text style={styles.betSubtitle} numberOfLines={1}>{pickLine}</Text> : null}
                  {/* Over/Under Progress Bar for single bets */}
                  {!isParlay && firstSelection && (() => {
                    const singleInfo = getInfo(bet.id, 0);
                    if (singleInfo?.overUnderProgress) {
                      return (
                        <OverUnderProgressBar
                          currentValue={singleInfo.overUnderProgress.currentValue}
                          threshold={singleInfo.overUnderProgress.threshold}
                          direction={singleInfo.overUnderProgress.direction}
                          statType={singleInfo.overUnderProgress.statType}
                          isLive={singleInfo.overUnderProgress.isLive}
                        />
                      );
                    }
                    return null;
                  })()}
                  {isParlay ? (
                    <Text style={[styles.betProfit, { color: colors.accent }]} numberOfLines={1}>{potentialStr}</Text>
                  ) : (
                    profitStr ? <Text style={[styles.betProfit, { color: badge.accent }]}>{profitStr}</Text> : null
                  )}
                  {isParlay && isExpanded && (
                    <View style={styles.parlayLegs}>
                      {bet.selections.map((sel, idx) => {
                        const info = getInfo(bet.id, idx);
                        const parsedSelection = parseEventString(sel.event);
                        return (
                          <React.Fragment key={`${bet.id}-leg-${sel.id}`}>
                            <TouchableOpacity
                              style={[styles.parlayLegRow, idx > 0 && styles.parlayLegRowSpacing]}
                              onPress={() => navigateToBetDetail(navigation, bet.id, idx)}
                              activeOpacity={0.8}
                            >
                              <View style={styles.parlayLegText}>
                                <Text style={styles.parlayLegTitle} numberOfLines={1}>
                                  {parsedSelection.matchTitle || sel.event}
                                </Text>
                                <Text style={styles.parlayLegSelection} numberOfLines={1}>{sel.selection}</Text>
                                <Text style={styles.parlayLegMeta} numberOfLines={1}>
                                  {[(sel.market || bet.market).toUpperCase(), formatOddsWithAt(sel.odds, sel.oddsFormat)].join(' · ')}
                                </Text>
                              </View>
                              <View style={[styles.statusBadge, styles.parlayLegBadge, { backgroundColor: info.bg }]}>
                                <Text style={[styles.statusText, { color: info.textColor }]} numberOfLines={1}>{info.smartLabel}</Text>
                              </View>
                            </TouchableOpacity>
                            {info.overUnderProgress ? (
                              <OverUnderProgressBar
                                currentValue={info.overUnderProgress.currentValue}
                                threshold={info.overUnderProgress.threshold}
                                direction={info.overUnderProgress.direction}
                                statType={info.overUnderProgress.statType}
                                isLive={info.overUnderProgress.isLive}
                              />
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </View>
                  )}
                </View>
                <View style={styles.betAside}>
                  <View style={[styles.statusBadge, styles.cardStatusBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.statusText, { color: badge.text }]} numberOfLines={1}>{badge.label}</Text>
                  </View>
                  {isParlay ? (
                    <TouchableOpacity
                      style={styles.parlayToggle}
                      onPress={(event) => {
                        event.stopPropagation?.();
                        toggleParlay(bet.id);
                      }}
                    >
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </TouchableOpacity>
            );

            return isParlay ? (
              <Swipeable
                key={bet.id}
                renderRightActions={parlaySwipeRight}
                overshootRight={false}
                friction={2}
                enableTrackpadTwoFingerGesture
                containerStyle={styles.swipeRow}
              >
                {card}
              </Swipeable>
            ) : (
              <View key={bet.id} style={styles.swipeRow}>{card}</View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  upgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.15)',
    gap: 8,
  },
  upgradeBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#FBBF24',
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(74, 159, 212, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(74, 159, 212, 0.15)',
    gap: 8,
  },
  trialBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  bankrollBar: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 4, marginBottom: 10,
    backgroundColor: 'rgba(22, 42, 78, 0.92)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(99, 130, 180, 0.12)', gap: 10,
  },
  bankrollBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bankrollBarLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(176, 198, 228, 0.65)', letterSpacing: 0.5 },
  bankrollBarValue: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  bankrollBarChange: { fontSize: 12, fontWeight: '700' },
  bankrollBarUnit: { marginLeft: 'auto', alignItems: 'flex-end' },
  bankrollBarUnitLabel: { fontSize: 9, color: colors.textMuted, letterSpacing: 0.3 },
  bankrollBarUnitValue: { fontSize: 12, fontWeight: '600', color: colors.accent },
  statsContainer: {
    flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 8, gap: 10,
  },
  statCard: {
    flex: 1, backgroundColor: 'rgba(22, 42, 78, 0.85)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 8,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(99, 130, 180, 0.1)',
  },
  statCardValue: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  statCardLabel: { fontSize: 9, fontWeight: '600', color: 'rgba(176, 198, 228, 0.5)', letterSpacing: 1, textTransform: 'uppercase' },
  miniStats: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, gap: 10 },
  miniStat: {
    flex: 1, backgroundColor: 'rgba(27, 56, 102, 0.45)', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(99, 130, 180, 0.08)',
  },
  miniStatVal: { fontSize: 16, fontWeight: '700' },
  miniStatLbl: { fontSize: 9, fontWeight: '600', color: 'rgba(176, 198, 228, 0.5)', marginTop: 4, letterSpacing: 0.8 },
  tabRow: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 10,
    backgroundColor: 'rgba(27, 56, 102, 0.45)', borderRadius: 10, padding: 3,
    borderWidth: 1, borderColor: 'rgba(99, 130, 180, 0.08)',
  },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: 'rgba(74, 159, 212, 0.2)' },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.3 },
  tabTextActive: { color: colors.accent },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8, paddingBottom: 96 },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 60 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginTop: 16 },
  emptyText: { fontSize: 14, color: 'rgba(176, 198, 228, 0.8)', marginTop: 8, textAlign: 'center' },
  emptyButton: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 20 },
  emptyButtonText: { fontWeight: 'bold', color: colors.primary },
  betCard: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: 'rgba(22, 42, 78, 0.9)', borderRadius: 14, overflow: 'hidden',
    minHeight: 68, borderWidth: 1, borderColor: 'rgba(99, 130, 180, 0.08)',
  },
  betAccentBar: { width: 3, alignSelf: 'stretch' },
  betContent: { flex: 1, paddingVertical: 10, paddingLeft: 14, paddingRight: 8, justifyContent: 'center' },
  parlayHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  parlayHeaderLabel: { fontSize: 10, fontWeight: '700', color: colors.accent, letterSpacing: 0.6, textTransform: 'uppercase' },
  betAside: {
    width: 74,
    paddingTop: 12,
    paddingRight: 14,
    paddingBottom: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  parlayToggle: {
    width: 32,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  betLeague: { fontSize: 10, fontWeight: '600', color: 'rgba(176,198,228,0.55)', letterSpacing: 0.5, marginBottom: 2 },
  betTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, letterSpacing: 0.1, marginBottom: 3 },
  betSubtitle: { fontSize: 12, color: colors.textMuted, letterSpacing: 0.1 },
  betProfit: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    minWidth: 54, alignItems: 'center', justifyContent: 'center',
  },
  cardStatusBadge: { marginRight: 0 },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FBBF24', marginRight: 5 },
  parlayLegs: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(99, 130, 180, 0.12)',
    paddingTop: 10,
  },
  parlayLegRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  parlayLegRowSpacing: { marginTop: 6 },
  parlayLegText: { flex: 1 },
  parlayLegTitle: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  parlayLegSelection: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  parlayLegMeta: { fontSize: 10, color: 'rgba(176,198,228,0.65)', marginTop: 2 },
  parlayLegBadge: { marginRight: 0, minWidth: 52 },
  swipeRow: { marginBottom: 10 },
  swipeAction: {
    width: 82,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    borderRadius: 14,
  },
  swipeArchive: { backgroundColor: '#22C55E' },
  swipeRestore: { backgroundColor: '#4A9FD4' },
  swipeActionLabel: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
