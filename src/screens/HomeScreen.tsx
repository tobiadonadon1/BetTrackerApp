import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { useBets, useBankroll, useMatchResults } from '../hooks';
import { useTranslation } from '../contexts/LanguageContext';
import AppBackground from '../components/AppBackground';
import PageHeader from '../components/PageHeader';
import { Bet, BetStatus, BetCategory } from '../types';
import { formatOddsWithAt } from '../utils/odds';
import { formatBetDate, getSourceLabel } from '../utils/betFormatting';
import { navigationRef } from '../services/notificationService';

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
    let total = 0;
    for (const b of bets) {
      if (b.selections?.length) {
        for (const s of b.selections) {
          total += 1;
          if (s.status === 'won') won += 1;
          else if (s.status === 'lost') lost += 1;
        }
      } else {
        total += 1;
        if (b.status === 'won') won += 1;
        else if (b.status === 'lost') lost += 1;
      }
    }
    const decided = won + lost;
    const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;
    return { total, won, lost, winRate };
  }, [bets]);

  const totalWagered = bets.reduce((sum, b) => sum + b.stake, 0);
  const wonTickets = bets.filter(b => b.status === 'won');
  const totalWonAmount = wonTickets.reduce((sum, b) => sum + b.stake * b.totalOdds, 0);
  const netProfit = totalWonAmount - totalWagered;
  const roi = totalWagered > 0 ? (netProfit / totalWagered) * 100 : 0;

  const { recentBets, archiveBets } = useMemo(() => {
    const recent: Bet[] = [];
    const archive: Bet[] = [];
    for (const bet of bets) {
      if (bet.archived) archive.push(bet);
      else recent.push(bet);
    }
    return { recentBets: recent, archiveBets: archive };
  }, [bets]);

  const displayBets = activeTab === 'recent' ? recentBets : archiveBets;
  const recentCount = recentBets.length;
  const archiveCount = archiveBets.length;

  return (
    <View style={styles.container}>
      <AppBackground />
      <PageHeader title={t('appName') || 'BETRA'} subtitle={t('tagline') || 'Track. Analyze. Win.'} />

      {bankrollConfigured && currentBalance !== null && (
        <View style={styles.bankrollBar}>
          <View style={styles.bankrollBarLeft}>
            <Ionicons name="wallet-outline" size={16} color={colors.accent} />
            <Text style={styles.bankrollBarLabel}>Bankroll</Text>
          </View>
          <Text style={styles.bankrollBarValue}>${currentBalance.toFixed(0)}</Text>
          <Text style={[styles.bankrollBarChange, { color: changePercent >= 0 ? colors.success : colors.error }]}>
            {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%
          </Text>
          <View style={styles.bankrollBarUnit}>
            <Text style={styles.bankrollBarUnitLabel}>Unit</Text>
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
          <Text style={styles.miniStatLbl}>NET P&L</Text>
        </View>
        <View style={styles.miniStat}>
          <Text style={[styles.miniStatVal, { color: roi >= 0 ? '#FBBF24' : colors.error }]}>
            {roi >= 0 ? `+${roi.toFixed(1)}%` : `${roi.toFixed(1)}%`}
          </Text>
          <Text style={styles.miniStatLbl}>ROI</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'recent' && styles.tabActive]}
          onPress={() => setActiveTab('recent')}
        >
          <Text style={[styles.tabText, activeTab === 'recent' && styles.tabTextActive]}>
            Recent{recentCount > 0 ? ` (${recentCount})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'archive' && styles.tabActive]}
          onPress={() => setActiveTab('archive')}
        >
          <Text style={[styles.tabText, activeTab === 'archive' && styles.tabTextActive]}>
            Archive{archiveCount > 0 ? ` (${archiveCount})` : ''}
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
                  accessibilityLabel={showArchive ? 'Archive parlay' : 'Restore parlay'}
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
                  <Text style={styles.swipeActionLabel}>{showArchive ? 'Archive' : 'Restore'}</Text>
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
                      <Text style={styles.parlayHeaderLabel}>{bet.selections.length} legs</Text>
                    </View>
                  )}
                  {leagueLine ? (
                    <Text style={styles.betLeague} numberOfLines={1}>{leagueLine}</Text>
                  ) : null}
                  <Text style={styles.betTitle} numberOfLines={1}>{titleLine}</Text>
                  <Text style={styles.betSubtitle} numberOfLines={1}>{infoLine}</Text>
                  <Text style={styles.betSubtitle} numberOfLines={1}>{dateLine}</Text>
                  {pickLine ? <Text style={styles.betSubtitle} numberOfLines={1}>{pickLine}</Text> : null}
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
                          <TouchableOpacity
                            key={`${bet.id}-leg-${sel.id}`}
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
