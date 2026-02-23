import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { useBets, useNotifications } from '../hooks';

interface BetDetailScreenProps {
  route: any;
  navigation: any;
}

export default function BetDetailScreen({ route, navigation }: BetDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { betId } = route.params || {};
  const { bets, updateStatus, deleteBet } = useBets();
  const { sendBetResultNotification } = useNotifications();
  const bet = bets.find(b => b.id === betId);

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

  const handleStatusChange = async (status: 'won' | 'lost') => {
    try {
      await updateStatus(bet.id, status);
      const profit = status === 'won' ? bet.potentialWin - bet.stake : -bet.stake;
      await sendBetResultNotification(bet.title, status, profit, bet.id);
    } catch (error: any) {
      const isNetwork = error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network');
      Alert.alert('Error', isNetwork ? 'Network connection failed. Please check your internet.' : 'Failed to update bet. Please try again.');
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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 50) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bet Details</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TouchableOpacity onPress={() => navigation.navigate('AddBet', { bet })}>
            <Ionicons name="pencil" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete}>
            <Ionicons name="trash" size={24} color={colors.error} />
          </TouchableOpacity>
        </View>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
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
