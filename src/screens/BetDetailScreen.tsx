import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { BetStatus } from '../types';
import { useBets, useNotifications, useLiveScores, useMatchResults } from '../hooks';
import { navigationRef } from '../services/notificationService';
import { formatOddsWithAt } from '../utils/odds';
import { formatBetDate, getSourceLabel } from '../utils/betFormatting';

interface BetDetailScreenProps {
  route: any;
  navigation: any;
}

export default function BetDetailScreen({ route, navigation }: BetDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { betId, selectionIndex: routeSelIndex = 0 } = route.params || {};
  const { bets, loading, updateStatus, updateBet, deleteBet, fetchBetById } = useBets();
  const { sendBetResultNotification } = useNotifications();
  const { matchBetToScore } = useLiveScores();
  const { getInfo } = useMatchResults(bets);
  const bet = bets.find(b => b.id === betId);
  const [initialFetchFinished, setInitialFetchFinished] = useState(false);
  const [selectedLegIndex, setSelectedLegIndex] = useState(routeSelIndex);

  useEffect(() => {
    let active = true;

    if (!betId) {
      setInitialFetchFinished(true);
      return;
    }

    fetchBetById(betId)
      .catch(() => null)
      .finally(() => {
        if (active) {
          setInitialFetchFinished(true);
        }
      });

    return () => {
      active = false;
    };
  }, [betId, fetchBetById]);

  useEffect(() => {
    if (!bet) return;
    const maxIndex = bet.selections?.length ? bet.selections.length - 1 : 0;
    const safeIndex = Math.max(0, Math.min(routeSelIndex, maxIndex));
    setSelectedLegIndex(safeIndex);
  }, [routeSelIndex, bet?.id, bet?.selections?.length]);

  if (loading || !initialFetchFinished) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 50) }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.errorText}>Loading bet...</Text>
      </View>
    );
  }

  if (!bet) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 50) }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.errorText}>Bet not found</Text>
      </View>
    );
  }

  const isMultiLeg = bet.betType !== 'single' && bet.selections?.length > 1;
  const selections = bet.selections || [];
  const wonLegs = selections.filter(s => s.status === 'won').length;
  const lostLegs = selections.filter(s => s.status === 'lost').length;
  const voidLegs = selections.filter(s => s.status === 'void').length;
  const pendingLegs = selections.filter(s => s.status === 'pending').length;
  const totalLegs = selections.length;
  const focusedSelection = selections[selectedLegIndex] || selections[0] || null;
  const focusedInfo = focusedSelection ? getInfo(bet.id, Math.min(selectedLegIndex, selections.length - 1)) : null;

  const handleStatusChange = async (status: 'won' | 'lost') => {
    try {
      await updateStatus(bet.id, status);
      const profit = status === 'won' ? bet.potentialWin - bet.stake : -bet.stake;
      await sendBetResultNotification(bet.title, status, profit);
    } catch (error: any) {
      const isNetwork = error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network');
      Alert.alert('Error', isNetwork ? 'Network connection failed. Please check your internet.' : 'Failed to update bet. Please try again.');
    }
  };

  const handleLegStatusChange = async (legId: string, newStatus: BetStatus) => {
    try {
      const updatedSelections = selections.map(s =>
        s.id === legId ? { ...s, status: newStatus } : s
      );

      // Determine overall bet status based on leg statuses
      const allResolved = updatedSelections.every(s => s.status !== 'pending');
      const anyLost = updatedSelections.some(s => s.status === 'lost');
      const allWon = updatedSelections.every(s => s.status === 'won' || s.status === 'void');

      let overallStatus: BetStatus = 'pending';
      if (allResolved) {
        if (anyLost) overallStatus = 'lost';
        else if (allWon) overallStatus = 'won';
      }

      await updateBet(bet.id, {
        selections: updatedSelections,
        status: overallStatus,
      });

      if (overallStatus === 'won' || overallStatus === 'lost') {
        const profit = overallStatus === 'won' ? bet.potentialWin - bet.stake : -bet.stake;
        await sendBetResultNotification(bet.title, overallStatus, profit);
      }
    } catch (error: any) {
      const isNetwork = error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network');
      Alert.alert('Error', isNetwork ? 'Network connection failed. Please check your internet.' : 'Failed to update leg. Please try again.');
    }
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      const confirm = window.confirm('Are you sure you want to delete this bet?');
      if (confirm) {
        deleteBet(bet.id).then(() => {
          navigation.goBack();
        }).catch((error: any) => {
          const isNetwork = error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network');
          window.alert(isNetwork ? 'Network connection failed. Please check your internet.' : 'Failed to delete bet. Please try again.');
        });
      }
    } else {
      Alert.alert('Delete Bet', 'Are you sure you want to delete this bet?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteBet(bet.id);
            navigation.goBack();
          } catch (error: any) {
            const isNetwork = error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network');
            Alert.alert('Error', isNetwork ? 'Network connection failed. Please check your internet.' : 'Failed to delete bet. Please try again.');
          }
        }}
      ]);
    }
  };

  const getStatusColor = (status: BetStatus) => {
    switch (status) {
      case 'won': return colors.success;
      case 'lost': return colors.error;
      case 'void': return colors.textMuted;
      default: return colors.pending;
    }
  };

  const getStatusIcon = (status: BetStatus): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case 'won': return 'checkmark-circle';
      case 'lost': return 'close-circle';
      case 'void': return 'remove-circle';
      default: return 'time';
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 50) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bet Details</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TouchableOpacity
            onPress={() => {
              const parent = typeof navigation.getParent === 'function' ? navigation.getParent() : null;
              if (parent?.navigate) parent.navigate('AddBet', { bet });
              else if (navigationRef.isReady()) navigationRef.navigate('AddBet', { bet });
              else navigation.navigate('AddBet', { bet });
            }}
          >
            <Ionicons name="pencil" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete}>
            <Ionicons name="trash" size={24} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <Text style={styles.title}>{bet.title}</Text>
        <View style={styles.subtitleRow}>
        <Text style={styles.subtitle}>{bet.bookmaker} • {formatBetDate(bet.date)}</Text>
          {isMultiLeg && (
            <View style={styles.betTypeBadge}>
              <Text style={styles.betTypeBadgeText}>{bet.betType.toUpperCase()}</Text>
            </View>
          )}
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Stake</Text>
            <Text style={styles.statValue}>${bet.stake}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Odds</Text>
            <Text style={styles.statValue}>{formatOddsWithAt(bet.totalOdds, bet.oddsFormat)}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Potential Win</Text>
            <Text style={styles.statValue}>${bet.potentialWin.toFixed(2)}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Recorded</Text>
            <Text style={styles.statValue}>{formatBetDate(bet.date)}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Status</Text>
            <Text style={[styles.statValue, { color: getStatusColor(bet.status) }]}>
              {bet.status.toUpperCase()}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Source</Text>
            <Text style={styles.statValue}>{getSourceLabel(bet.source)}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Market</Text>
            <Text style={styles.statValue}>{(bet.market || 'other').replace(/^\w/, c => c.toUpperCase())}</Text>
          </View>
          <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.statLabel}>Category</Text>
            <Text style={styles.statValue}>{bet.category}{bet.league ? ` · ${bet.league}` : ''}</Text>
          </View>
        </View>

        {focusedSelection && (
          <View style={styles.focusCard}>
            <View style={styles.focusHeader}>
              <Text style={styles.sectionTitle}>Leg Focus</Text>
              {focusedInfo && (
                <Text style={[styles.focusStatus, { color: focusedInfo.textColor }]}>{focusedInfo.smartLabel}</Text>
              )}
            </View>
            <Text style={styles.focusMatch} numberOfLines={2}>{focusedSelection.event}</Text>
            <Text style={styles.focusSelection} numberOfLines={2}>{focusedSelection.selection}</Text>
            <View style={styles.focusMetaRow}>
              <Text style={styles.focusMeta}>{(focusedSelection.market || bet.market).toUpperCase()}</Text>
              <Text style={styles.focusMeta}>{formatOddsWithAt(focusedSelection.odds, focusedSelection.oddsFormat)}</Text>
            </View>
            {focusedInfo?.score ? (
              <Text style={styles.focusScore}>Score: {focusedInfo.score}</Text>
            ) : null}
          </View>
        )}

        {/* Live Score */}
        {bet.status === 'pending' && (() => {
          const liveMatch = matchBetToScore(bet);
          if (!liveMatch) return null;
          return (
            <View style={styles.liveScoreCard}>
              <View style={styles.liveScoreHeader}>
                <View style={styles.liveScoreDot} />
                <Text style={styles.liveScoreLabel}>
                  {liveMatch.score.completed ? 'FINAL SCORE' : 'LIVE SCORE'}
                </Text>
              </View>
              <Text style={styles.liveScoreText}>{liveMatch.display}</Text>
            </View>
          );
        })()}

        {/* Multi-leg progress bar */}
        {isMultiLeg && totalLegs > 0 && (
          <View style={styles.progressSection}>
            <Text style={styles.sectionTitle}>Legs Progress</Text>
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBar}>
                {wonLegs > 0 && (
                  <View style={[styles.progressSegment, { flex: wonLegs, backgroundColor: colors.success }]} />
                )}
                {lostLegs > 0 && (
                  <View style={[styles.progressSegment, { flex: lostLegs, backgroundColor: colors.error }]} />
                )}
                {voidLegs > 0 && (
                  <View style={[styles.progressSegment, { flex: voidLegs, backgroundColor: colors.textMuted }]} />
                )}
                {pendingLegs > 0 && (
                  <View style={[styles.progressSegment, { flex: pendingLegs, backgroundColor: colors.pending }]} />
                )}
              </View>
            </View>
            <View style={styles.progressLegend}>
              {wonLegs > 0 && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                  <Text style={styles.legendText}>{wonLegs} Won</Text>
                </View>
              )}
              {lostLegs > 0 && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
                  <Text style={styles.legendText}>{lostLegs} Lost</Text>
                </View>
              )}
              {voidLegs > 0 && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.textMuted }]} />
                  <Text style={styles.legendText}>{voidLegs} Void</Text>
                </View>
              )}
              {pendingLegs > 0 && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.pending }]} />
                  <Text style={styles.legendText}>{pendingLegs} Pending</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Selections / Legs list */}
        {isMultiLeg && (
          <View style={styles.legsSection}>
            <Text style={styles.sectionTitle}>Selections</Text>
            {selections.map((sel, index) => (
              <TouchableOpacity
                key={sel.id}
                style={[styles.legCard, selectedLegIndex === index && styles.legCardSelected]}
                onPress={() => setSelectedLegIndex(index)}
                activeOpacity={0.9}
              >
                <View style={[styles.legAccent, { backgroundColor: getStatusColor(sel.status) }]} />
                <View style={styles.legContent}>
                  <View style={styles.legTopRow}>
                    <Text style={styles.legIndex}>Leg {index + 1}</Text>
                    <View style={styles.legStatusRow}>
                      <Ionicons name={getStatusIcon(sel.status)} size={16} color={getStatusColor(sel.status)} />
                      <Text style={[styles.legStatusText, { color: getStatusColor(sel.status) }]}>
                        {sel.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.legEvent} numberOfLines={1}>{sel.event}</Text>
                  <View style={styles.legDetails}>
                    <Text style={styles.legSelection} numberOfLines={1}>{sel.selection}</Text>
                    <Text style={styles.legOdds}>{formatOddsWithAt(sel.odds, sel.oddsFormat)}</Text>
                  </View>
                  <Text style={styles.legCategory}>
                    {sel.category}{sel.market ? ` · ${sel.market.toUpperCase()}` : ''}
                  </Text>

                  {/* Leg status actions */}
                  {sel.status === 'pending' && (
                    <View style={styles.legActions}>
                      <TouchableOpacity
                        style={[styles.legActionBtn, { backgroundColor: 'rgba(74, 222, 128, 0.15)' }]}
                        onPress={() => handleLegStatusChange(sel.id, 'won')}
                      >
                        <Ionicons name="checkmark" size={14} color={colors.success} />
                        <Text style={[styles.legActionText, { color: colors.success }]}>Won</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.legActionBtn, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}
                        onPress={() => handleLegStatusChange(sel.id, 'lost')}
                      >
                        <Ionicons name="close" size={14} color={colors.error} />
                        <Text style={[styles.legActionText, { color: colors.error }]}>Lost</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.legActionBtn, { backgroundColor: 'rgba(107, 140, 174, 0.15)' }]}
                        onPress={() => handleLegStatusChange(sel.id, 'void')}
                      >
                        <Ionicons name="remove" size={14} color={colors.textMuted} />
                        <Text style={[styles.legActionText, { color: colors.textMuted }]}>Void</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Overall bet actions (single bets or overall multi-leg) */}
        {bet.status === 'pending' && !isMultiLeg && (
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.success }]} onPress={() => handleStatusChange('won')}>
              <Text style={styles.actionText}>Mark as Won</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.error }]} onPress={() => handleStatusChange('lost')}>
              <Text style={styles.actionText}>Mark as Lost</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? { height: '100vh' as any, maxHeight: '100vh' as any, overflow: 'hidden' as any } : {}),
  },
  scrollView: {
    flex: 1,
    minHeight: 0,
    ...Platform.select({
      web: {
        overflow: 'scroll',
        WebkitOverflowScrolling: 'touch',
      },
      default: {},
    }),
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  content: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 8 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 10 },
  subtitle: { fontSize: 14, color: colors.textMuted },
  betTypeBadge: { backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  betTypeBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 0.5 },
  statsCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  statLabel: { fontSize: 16, color: colors.textMuted },
  statValue: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  actionButton: { flex: 1, borderRadius: 12, padding: 16, alignItems: 'center' },
  actionText: { fontWeight: 'bold', color: colors.textPrimary, fontSize: 16 },
  errorText: { color: colors.error, fontSize: 18, textAlign: 'center', marginTop: 100 },

  // Progress bar
  progressSection: { marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  progressBarContainer: { marginBottom: 10 },
  progressBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: 'rgba(45, 74, 111, 0.3)',
  },
  progressSegment: { height: '100%' },
  progressLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: colors.textSecondary },
  focusCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  focusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  focusStatus: { fontSize: 12, fontWeight: '700' },
  focusMatch: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  focusSelection: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  focusMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  focusMeta: { fontSize: 12, color: colors.textMuted },
  focusScore: { fontSize: 12, color: colors.textMuted, marginTop: 6 },

  // Legs
  legsSection: { marginTop: 20 },
  legCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  legCardSelected: { borderColor: colors.accent },
  legAccent: { width: 4, alignSelf: 'stretch' },
  legContent: { flex: 1, padding: 14 },
  legTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  legIndex: { fontSize: 12, fontWeight: '700', color: colors.accent, letterSpacing: 0.5 },
  legStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legStatusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  legEvent: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  legDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  legSelection: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  legOdds: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  legCategory: { fontSize: 11, color: colors.textMuted, marginBottom: 4 },

  // Leg actions
  legActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  legActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  legActionText: { fontSize: 12, fontWeight: '600' },

  // Live score
  liveScoreCard: {
    marginTop: 16,
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.25)',
  },
  liveScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  liveScoreDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F97316',
  },
  liveScoreLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F97316',
    letterSpacing: 0.5,
  },
  liveScoreText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
