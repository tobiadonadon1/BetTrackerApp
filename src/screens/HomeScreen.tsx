import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { useBets } from '../hooks';
import { useTranslation } from '../contexts/LanguageContext';
import AppBackground from '../components/AppBackground';
import PageHeader from '../components/PageHeader';

interface HomeScreenProps {
  navigation: any;
}

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const { bets, loading, refresh } = useBets();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'recent' | 'archive'>('recent');

  const totalBets = bets.length;
  const wonBets = bets.filter(b => b.status === 'won').length;
  const lostBets = bets.filter(b => b.status === 'lost').length;
  const winRate = totalBets > 0 ? Math.round((wonBets / totalBets) * 100) : 0;

  // Filter bets for the last 3 days
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  
  const recentBets = bets.filter(b => new Date(b.date) >= threeDaysAgo);
  const archiveBets = bets.filter(b => new Date(b.date) < threeDaysAgo);
  
  const displayBets = activeTab === 'recent' ? recentBets : archiveBets;

  return (
    <View style={styles.container}>
      <AppBackground />
      <PageHeader title={t('appName') || "BETRA"} subtitle={t('tagline') || "Track. Analyze. Win."} />

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalBets}</Text>
          <Text style={styles.statLabel}>{t('totalBets') || "Total Bets"}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.success }]}>{winRate}%</Text>
          <Text style={styles.statLabel}>{t('winRate') || "Win Rate"}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.error }]}>{lostBets}</Text>
          <Text style={styles.statLabel}>{t('losses') || "Losses"}</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'recent' && styles.tabActive]}
          onPress={() => setActiveTab('recent')}
        >
          <Text style={[styles.tabText, activeTab === 'recent' && styles.tabTextActive]}>Recent (3 Days)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'archive' && styles.tabActive]}
          onPress={() => setActiveTab('archive')}
        >
          <Text style={[styles.tabText, activeTab === 'archive' && styles.tabTextActive]}>Archive</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        {displayBets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color={colors.accent} />
            <Text style={styles.emptyTitle}>
              {activeTab === 'recent' ? (t('noBetsYet') || "No recent bets") : "Archive empty"}
            </Text>
            {activeTab === 'recent' && (
              <Text style={styles.emptyText}>{t('addFirstBet') || "Add your first bet to start tracking"}</Text>
            )}
            {activeTab === 'recent' && (
              <TouchableOpacity 
                style={styles.emptyButton} 
                onPress={() => navigation.navigate('AddBet')}
                accessibilityRole="button"
                accessibilityLabel={t('addBet') || "Add Bet"}
              >
                <Text style={styles.emptyButtonText}>{t('addBet') || "Add Bet"}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          displayBets.map(bet => (
            <TouchableOpacity key={bet.id} style={styles.betCard} onPress={() => navigation.navigate('BetDetail', { betId: bet.id })}>
              <View style={styles.betHeader}>
                <Text style={styles.betTitle}>{bet.title}</Text>
                <View style={[styles.statusBadge, { backgroundColor: bet.status === 'won' ? colors.success : bet.status === 'lost' ? colors.error : colors.pending }]}>
                  <Text style={styles.statusText}>{bet.status}</Text>
                </View>
              </View>
              <Text style={styles.betSubtitle}>{bet.bookmaker} • {bet.date}</Text>
              <View style={styles.betFooter}>
                <Text style={styles.betStake}>${bet.stake}</Text>
                <Text style={styles.betOdds}>@{bet.totalOdds}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(27, 56, 102, 0.62)',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.22)',
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(27, 56, 102, 0.5)',
    borderRadius: 12,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: 'rgba(135, 206, 235, 0.25)' },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.accent },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  statLabel: { fontSize: 12, color: 'rgba(176, 198, 228, 0.85)', marginTop: 2 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 96 },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 60 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginTop: 16 },
  emptyText: { fontSize: 14, color: 'rgba(176, 198, 228, 0.8)', marginTop: 8, textAlign: 'center' },
  emptyButton: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 20 },
  emptyButtonText: { fontWeight: 'bold', color: colors.primary },
  betCard: {
    backgroundColor: 'rgba(17, 39, 78, 0.72)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(120, 166, 229, 0.24)',
  },
  betHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  betTitle: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary, flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: 'bold', color: colors.primary },
  betSubtitle: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  betFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  betStake: { fontSize: 14, fontWeight: 'bold', color: colors.textPrimary },
  betOdds: { fontSize: 14, fontWeight: 'bold', color: colors.accent },
});
