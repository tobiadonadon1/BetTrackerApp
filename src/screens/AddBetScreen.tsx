import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { BetCategory, BetType } from '../types';
import { useBets } from '../hooks';

interface AddBetScreenProps {
  navigation: any;
  route: any;
}

const CATEGORIES: BetCategory[] = ['NBA', 'NFL', 'MLB', 'NHL', 'Soccer', 'Tennis', 'UFC', 'Boxing', 'Golf', 'Other'];

export default function AddBetScreen({ navigation, route }: AddBetScreenProps) {
  const insets = useSafeAreaInsets();
  const { createBet, updateBet } = useBets();
  const editingBet = route.params?.bet;

  const [title, setTitle] = useState(editingBet?.title || '');
  const [bookmaker, setBookmaker] = useState(editingBet?.bookmaker || '');
  const [stake, setStake] = useState(editingBet?.stake?.toString() || '');
  const [odds, setOdds] = useState(editingBet?.totalOdds?.toString() || '');
  const [category, setCategory] = useState<BetCategory>(editingBet?.category || 'Other');

  const handleSave = async () => {
    if (!title || !bookmaker || !stake || !odds) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    try {
      if (editingBet) {
        await updateBet(editingBet.id, {
          title: title.trim(),
          bookmaker: bookmaker.trim(),
          stake: parseFloat(stake),
          totalOdds: parseFloat(odds),
          potentialWin: parseFloat(stake) * parseFloat(odds),
          category,
        });
        Alert.alert('Success', 'Bet updated!', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        await createBet({
          title: title.trim(),
          bookmaker: bookmaker.trim(),
          stake: parseFloat(stake),
          totalOdds: parseFloat(odds),
          potentialWin: parseFloat(stake) * parseFloat(odds),
          status: 'pending',
          date: new Date().toISOString().split('T')[0],
          selections: [{
            id: Date.now().toString(),
            event: title.trim(),
            selection: title.trim(),
            odds: parseFloat(odds),
            status: 'pending',
            category,
          }],
          category,
          betType: 'single',
        });
        Alert.alert('Success', 'Bet saved!', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (error: any) {
      const isNetwork = error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network');
      Alert.alert('Error', isNetwork ? 'Network connection failed. Please check your internet.' : 'Failed to save bet. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 50) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{editingBet ? 'Edit Bet' : 'Add Bet'}</Text>
        <TouchableOpacity 
          style={styles.saveButton} 
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save Bet"
        >
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {!editingBet && (
          <TouchableOpacity 
          style={styles.scanTicketButton} 
          onPress={() => navigation.navigate('ScanTicket')}
          accessibilityRole="button"
          accessibilityLabel="Scan Ticket Instantly"
        >
            <Ionicons name="camera" size={20} color={colors.primary} />
            <Text style={styles.scanTicketText}>Scan Ticket Instantly</Text>
          </TouchableOpacity>
        )}

        <TextInput
          style={styles.input}
          placeholder="Bet Title *"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={styles.input}
          placeholder="Bookmaker *"
          placeholderTextColor={colors.textMuted}
          value={bookmaker}
          onChangeText={setBookmaker}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex1]}
            placeholder="Stake $"
            placeholderTextColor={colors.textMuted}
            value={stake}
            onChangeText={setStake}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.input, styles.flex1]}
            placeholder="Odds"
            placeholderTextColor={colors.textMuted}
            value={odds}
            onChangeText={setOdds}
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.label}>Category</Text>
        <View style={styles.categoryContainer}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryButton, category === cat && styles.categoryButtonActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  saveButton: { backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  saveText: { fontWeight: 'bold', color: colors.primary },
  scrollView: { flex: 1 },
  content: { padding: 16 },
  input: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 },
  categoryContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoryButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  categoryButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  categoryText: { fontSize: 12, color: colors.textMuted },
  categoryTextActive: { color: colors.primary, fontWeight: '600' },
  scanTicketButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: 12, padding: 14, marginBottom: 20, gap: 8 },
  scanTicketText: { fontWeight: 'bold', color: colors.primary, fontSize: 16 },
});
