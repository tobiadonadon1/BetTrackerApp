import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { useBets } from '../hooks';

interface BetDetailScreenProps {
  route: any;
  navigation: any;
}

export default function BetDetailScreen({ route, navigation }: BetDetailScreenProps) {
  const { betId } = route.params || {};
  const { bets, updateStatus } = useBets();
  const bet = bets.find(b => b.id === betId);

  if (!bet) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Bet not found</Text>
      </View>
    );
  }

  const handleStatusChange = (status: 'won' | 'lost') => {
    updateStatus(bet.id, status);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bet Details</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{bet.title}</Text>
        <Text style={styles.subtitle}>{bet.bookmaker} • {bet.date}</Text>

        <View style={styles.statsCard}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Stake</Text>
            <Text style={styles.statValue}>${bet.stake}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Odds</Text>
            <Text style={styles.statValue}>@{bet.totalOdds}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Potential Win</Text>
            <Text style={styles.statValue}>${bet.potentialWin.toFixed(2)}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Status</Text>
            <Text style={[styles.statValue, { color: bet.status === 'won' ? colors.success : bet.status === 'lost' ? colors.error : colors.pending }]}>
              {bet.status.toUpperCase()}
            </Text>
          </View>
        </View>

        {bet.status === 'pending' && (
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
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12 },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  content: { padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: 24 },
  statsCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  statLabel: { fontSize: 16, color: colors.textMuted },
  statValue: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  actionButton: { flex: 1, borderRadius: 12, padding: 16, alignItems: 'center' },
  actionText: { fontWeight: 'bold', color: colors.textPrimary, fontSize: 16 },
  errorText: { color: colors.error, fontSize: 18, textAlign: 'center', marginTop: 100 },
});
