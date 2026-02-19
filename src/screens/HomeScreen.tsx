import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { useBets } from '../hooks';

interface HomeScreenProps {
  navigation: any;
}

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const { bets } = useBets();

  const totalBets = bets.length;
  const wonBets = bets.filter(b => b.status === 'won').length;
  const lostBets = bets.filter(b => b.status === 'lost').length;
  const winRate = totalBets > 0 ? Math.round((wonBets / totalBets) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BETRA</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('AddBet')}>
          <Ionicons name="add" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalBets}</Text>
          <Text style={styles.statLabel}>Total Bets</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.success }]}>{winRate}%</Text>
          <Text style={styles.statLabel}>Win Rate</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.error }]}>{lostBets}</Text>
          <Text style={styles.statLabel}>Losses</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {bets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color={colors.accent} />
            <Text style={styles.emptyTitle}>No bets yet</Text>
            <Text style={styles.emptyText}>Add your first bet to start tracking</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('AddBet')}>
              <Text style={styles.emptyButtonText}>Add Bet</Text>
            </TouchableOpacity>
          </View>
        ) : (
          bets.map(bet => (
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: colors.textPrimary, letterSpacing: 4 },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16 },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 60 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginTop: 16 },
  emptyText: { fontSize: 14, color: colors.textMuted, marginTop: 8, textAlign: 'center' },
  emptyButton: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 20 },
  emptyButtonText: { fontWeight: 'bold', color: colors.primary },
  betCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  betHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  betTitle: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary, flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: 'bold', color: colors.primary },
  betSubtitle: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  betFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  betStake: { fontSize: 14, fontWeight: 'bold', color: colors.textPrimary },
  betOdds: { fontSize: 14, fontWeight: 'bold', color: colors.accent },
});
