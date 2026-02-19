import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { BetCategory, BetType } from '../types';
import { useBets } from '../hooks';

interface AddBetScreenProps {
  navigation: any;
}

const CATEGORIES: BetCategory[] = ['NBA', 'NFL', 'MLB', 'NHL', 'Soccer', 'Tennis', 'UFC', 'Boxing', 'Golf', 'Other'];

export default function AddBetScreen({ navigation }: AddBetScreenProps) {
  const { createBet } = useBets();
  const [title, setTitle] = useState('');
  const [bookmaker, setBookmaker] = useState('');
  const [stake, setStake] = useState('');
  const [odds, setOdds] = useState('');
  const [category, setCategory] = useState<BetCategory>('Other');

  const handleSave = async () => {
    if (!title || !bookmaker || !stake || !odds) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    try {
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
    } catch (error) {
      Alert.alert('Error', 'Failed to save bet');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Bet</Text>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12 },
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
});
