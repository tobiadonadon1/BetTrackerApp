import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { BetCategory, BetType, BetMarket, BetSelection, OddsFormat } from '../types';
import { useBets } from '../hooks';
import { parseOddsInput, oddsInputFromStored } from '../utils/odds';

interface AddBetScreenProps {
  navigation: any;
  route: any;
}

const CATEGORIES: BetCategory[] = ['NBA', 'NFL', 'MLB', 'NHL', 'Soccer', 'Tennis', 'UFC', 'Boxing', 'Golf', 'Other'];
const BET_TYPES: { value: BetType; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'parlay', label: 'Parlay' },
  { value: 'teaser', label: 'Teaser' },
  { value: 'round-robin', label: 'Round Robin' },
];
const MARKETS: { value: BetMarket; label: string }[] = [
  { value: 'moneyline', label: 'Moneyline' },
  { value: 'spread', label: 'Spread' },
  { value: 'totals', label: 'Totals' },
  { value: 'other', label: 'Other' },
];

interface LegInput {
  id: string;
  event: string;
  selection: string;
  odds: string;
  category: BetCategory;
}

const createEmptyLeg = (): LegInput => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
  event: '',
  selection: '',
  odds: '',
  category: 'Other',
});

export default function AddBetScreen({ navigation, route }: AddBetScreenProps) {
  const insets = useSafeAreaInsets();
  const { createBet, updateBet } = useBets();
  const editingBet = route.params?.bet;

  const [betType, setBetType] = useState<BetType>(editingBet?.betType || 'single');
  const [title, setTitle] = useState(editingBet?.title || '');
  const [bookmaker, setBookmaker] = useState(editingBet?.bookmaker || '');
  const [stake, setStake] = useState(editingBet?.stake?.toString() || '');
  const [odds, setOdds] = useState(() => {
    if (!editingBet) return '';
    return oddsInputFromStored(editingBet.totalOdds, editingBet.oddsFormat ?? 'decimal');
  });
  const [category, setCategory] = useState<BetCategory>(editingBet?.category || 'Other');
  const [market, setMarket] = useState<BetMarket>(editingBet?.market || 'other');
  const [league, setLeague] = useState(editingBet?.league || '');

  // Multi-leg state
  const initLegs = (): LegInput[] => {
    if (editingBet && editingBet.selections?.length > 1) {
      return editingBet.selections.map((s: BetSelection) => ({
        id: s.id,
        event: s.event,
        selection: s.selection,
        odds: oddsInputFromStored(s.odds, s.oddsFormat ?? 'decimal'),
        category: s.category,
      }));
    }
    return [createEmptyLeg(), createEmptyLeg()];
  };

  const [legs, setLegs] = useState<LegInput[]>(initLegs);

  const isMultiLeg = betType !== 'single';

  const calculatedTotalOdds = useMemo(() => {
    if (!isMultiLeg) {
      const parsed = parseOddsInput(odds);
      return parsed.decimal || 0;
    }
    const decimals = legs
      .map(l => parseOddsInput(l.odds).decimal)
      .filter(val => val > 0);
    if (decimals.length === 0) return 0;
    return decimals.reduce((acc, val) => acc * val, 1);
  }, [isMultiLeg, legs, odds]);

  const potentialWin = useMemo(() => {
    const s = parseFloat(stake) || 0;
    const val = s * calculatedTotalOdds;
    return Number.isFinite(val) ? Number(val.toFixed(2)) : 0;
  }, [stake, calculatedTotalOdds]);

  const updateLeg = (id: string, field: keyof LegInput, value: string) => {
    setLegs(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const updateLegCategory = (id: string, cat: BetCategory) => {
    setLegs(prev => prev.map(l => l.id === id ? { ...l, category: cat } : l));
  };

  const addLeg = () => {
    setLegs(prev => [...prev, createEmptyLeg()]);
  };

  const removeLeg = (id: string) => {
    if (legs.length <= 2) return;
    setLegs(prev => prev.filter(l => l.id !== id));
  };

  const handleSave = async () => {
    if (!bookmaker || !stake) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    const stakeValue = parseFloat(stake);
    if (!bookmaker.trim() || Number.isNaN(stakeValue) || stakeValue <= 0) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    const trimmedTitle = title.trim();
    if (isMultiLeg) {
      const validLegs = legs.filter(l => {
        const parsed = parseOddsInput(l.odds);
        return l.event.trim() && l.selection.trim() && parsed.decimal > 1;
      });
      if (validLegs.length < 2) {
        Alert.alert('Error', 'Please add at least 2 valid legs with event, selection, and odds');
        return;
      }
    } else if (!trimmedTitle || !odds.trim()) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    try {
      let selections: BetSelection[] = [];
      let betCategory: BetCategory = category;
      let betOddsFormat: OddsFormat = 'decimal';

      if (isMultiLeg) {
        const normalizedLegs = legs
          .map(l => ({ leg: l, parsed: parseOddsInput(l.odds) }))
          .filter(({ leg, parsed }) => leg.event.trim() && leg.selection.trim() && parsed.decimal > 1);

        selections = normalizedLegs.map(({ leg, parsed }) => ({
          id: leg.id,
          event: leg.event.trim(),
          selection: leg.selection.trim(),
          odds: Number(parsed.decimal.toFixed(4)),
          oddsFormat: parsed.format,
          status: 'pending' as const,
          category: leg.category,
          market,
        }));
        betCategory = selections[0]?.category || 'Other';
        betOddsFormat = 'decimal';
      } else {
        const parsed = parseOddsInput(odds);
        if (parsed.decimal <= 1) {
          Alert.alert('Error', 'Please enter valid odds greater than 1.00 or a proper American value');
          return;
        }
        selections = [{
          id: Date.now().toString(),
          event: trimmedTitle,
          selection: trimmedTitle,
          odds: Number(parsed.decimal.toFixed(4)),
          oddsFormat: parsed.format,
          status: 'pending' as const,
          category,
          market,
        }];
        betOddsFormat = parsed.format;
      }

      const betTitle = isMultiLeg
        ? `${betType.charAt(0).toUpperCase() + betType.slice(1)} (${selections.length} legs)`
        : trimmedTitle;

      const totalOddsValue = Number(calculatedTotalOdds.toFixed(4));
      if (!totalOddsValue || totalOddsValue <= 1) {
        Alert.alert('Error', 'Total odds must be greater than 1.00');
        return;
      }

      const resolvedSource = editingBet?.source ?? 'manual';

      const betData = {
        title: betTitle,
        bookmaker: bookmaker.trim(),
        stake: stakeValue,
        totalOdds: totalOddsValue,
        oddsFormat: betOddsFormat,
        potentialWin,
        category: betCategory,
        betType,
        selections: selections as BetSelection[],
        market,
        league: league.trim() || undefined,
        source: resolvedSource,
      };

      if (editingBet) {
        await updateBet(editingBet.id, betData);
        Alert.alert('Success', 'Bet updated!', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        await createBet({
          ...betData,
          status: 'pending',
          date: new Date().toISOString(),
          source: 'manual',
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
          <View style={styles.scanActionsRow}>
            <TouchableOpacity
              style={[styles.scanTicketButton, styles.scanTicketButtonHalf]}
              onPress={() => navigation.navigate('ScanTicket', { mode: 'camera' })}
              accessibilityRole="button"
              accessibilityLabel="Scan Ticket Instantly"
            >
              <Ionicons name="camera" size={20} color={colors.primary} />
              <Text style={styles.scanTicketText} numberOfLines={1}>Scan ticket</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.uploadTicketButton, styles.scanTicketButtonHalf]}
              onPress={() => navigation.navigate('ScanTicket', { mode: 'gallery' })}
              accessibilityRole="button"
              accessibilityLabel="Upload ticket photo"
            >
              <Ionicons name="images" size={20} color={colors.accent} />
              <Text style={styles.uploadTicketText} numberOfLines={1}>Upload photo</Text>
            </TouchableOpacity>
          </View>
        )}
        {!editingBet && (
          <Text style={styles.scanHint}>Camera scan or upload from gallery — same review & save flow.</Text>
        )}

        {/* Bet Type Selector */}
        <Text style={styles.label}>Bet Type</Text>
        <View style={styles.betTypeContainer}>
          {BET_TYPES.map((bt) => (
            <TouchableOpacity
              key={bt.value}
              style={[styles.betTypeButton, betType === bt.value && styles.betTypeButtonActive]}
              onPress={() => setBetType(bt.value)}
            >
              <Text style={[styles.betTypeText, betType === bt.value && styles.betTypeTextActive]}>
                {bt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Bookmaker *"
          placeholderTextColor={colors.textMuted}
          value={bookmaker}
          onChangeText={setBookmaker}
        />

        {/* Market Selector */}
        <Text style={styles.label}>Market</Text>
        <View style={styles.betTypeContainer}>
          {MARKETS.map((m) => (
            <TouchableOpacity
              key={m.value}
              style={[styles.betTypeButton, market === m.value && styles.betTypeButtonActive]}
              onPress={() => setMarket(m.value)}
            >
              <Text style={[styles.betTypeText, market === m.value && styles.betTypeTextActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Single bet fields */}
        {!isMultiLeg && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Bet Title *"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
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

            {/* League (optional) */}
            <TextInput
              style={styles.input}
              placeholder="League (optional, e.g. Premier League)"
              placeholderTextColor={colors.textMuted}
              value={league}
              onChangeText={setLeague}
            />

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
          </>
        )}

        {/* Multi-leg fields */}
        {isMultiLeg && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Stake $ *"
              placeholderTextColor={colors.textMuted}
              value={stake}
              onChangeText={setStake}
              keyboardType="decimal-pad"
            />

            <TextInput
              style={styles.input}
              placeholder="League (optional)"
              placeholderTextColor={colors.textMuted}
              value={league}
              onChangeText={setLeague}
            />

            <View style={styles.legsHeader}>
              <Text style={styles.label}>Legs ({legs.length})</Text>
            </View>

            {legs.map((leg, index) => (
              <View key={leg.id} style={styles.legCard}>
                <View style={styles.legCardHeader}>
                  <Text style={styles.legNumber}>Leg {index + 1}</Text>
                  {legs.length > 2 && (
                    <TouchableOpacity onPress={() => removeLeg(leg.id)} style={styles.removeLegButton}>
                      <Ionicons name="close-circle" size={22} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>

                <TextInput
                  style={styles.legInput}
                  placeholder="Event (e.g. Lakers vs Warriors)"
                  placeholderTextColor={colors.textMuted}
                  value={leg.event}
                  onChangeText={(v) => updateLeg(leg.id, 'event', v)}
                />
                <View style={styles.row}>
                  <TextInput
                    style={[styles.legInput, styles.flex1]}
                    placeholder="Selection"
                    placeholderTextColor={colors.textMuted}
                    value={leg.selection}
                    onChangeText={(v) => updateLeg(leg.id, 'selection', v)}
                  />
                  <TextInput
                    style={[styles.legInput, { width: 80 }]}
                    placeholder="Odds"
                    placeholderTextColor={colors.textMuted}
                    value={leg.odds}
                    onChangeText={(v) => updateLeg(leg.id, 'odds', v)}
                    keyboardType="decimal-pad"
                  />
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.legCategoryScroll}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.legCategoryButton, leg.category === cat && styles.categoryButtonActive]}
                      onPress={() => updateLegCategory(leg.id, cat)}
                    >
                      <Text style={[styles.categoryText, leg.category === cat && styles.categoryTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ))}

            <TouchableOpacity style={styles.addLegButton} onPress={addLeg}>
              <Ionicons name="add-circle" size={22} color={colors.accent} />
              <Text style={styles.addLegText}>Add Leg</Text>
            </TouchableOpacity>

            {calculatedTotalOdds > 0 && parseFloat(stake) > 0 && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total Odds</Text>
                  <Text style={styles.summaryValue}>@{calculatedTotalOdds.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Potential Win</Text>
                  <Text style={[styles.summaryValue, { color: colors.success }]}>
                    ${potentialWin.toFixed(2)}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}
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
  content: { padding: 16, paddingBottom: 40 },
  input: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 },
  categoryContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoryButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  categoryButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  categoryText: { fontSize: 12, color: colors.textMuted },
  categoryTextActive: { color: colors.primary, fontWeight: '600' },
  scanActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  scanTicketButtonHalf: { flex: 1, marginBottom: 0, minHeight: 52 },
  scanTicketButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: 12, padding: 14, marginBottom: 20, gap: 8 },
  uploadTicketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22, 42, 78, 0.95)',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  scanTicketText: { fontWeight: 'bold', color: colors.primary, fontSize: 13 },
  uploadTicketText: { fontWeight: '700', color: colors.accent, fontSize: 13 },
  scanHint: { fontSize: 12, color: colors.textMuted, marginBottom: 18, textAlign: 'center', lineHeight: 16 },
  betTypeContainer: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  betTypeButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  betTypeButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  betTypeText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  betTypeTextActive: { color: colors.primary },
  legsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  legCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  legCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  legNumber: { fontSize: 13, fontWeight: '700', color: colors.accent, letterSpacing: 0.5 },
  removeLegButton: { padding: 2 },
  legInput: { backgroundColor: 'rgba(11, 27, 61, 0.5)', borderRadius: 10, padding: 12, marginBottom: 8, color: colors.textPrimary, borderWidth: 1, borderColor: 'rgba(45, 74, 111, 0.5)', fontSize: 14 },
  legCategoryScroll: { marginTop: 4, marginBottom: 2 },
  legCategoryButton: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(11, 27, 61, 0.5)', borderWidth: 1, borderColor: 'rgba(45, 74, 111, 0.5)', marginRight: 6 },
  addLegButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed', marginBottom: 16 },
  addLegText: { fontSize: 15, fontWeight: '600', color: colors.accent },
  summaryCard: { backgroundColor: 'rgba(74, 222, 128, 0.08)', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(74, 222, 128, 0.2)', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLabel: { fontSize: 14, color: colors.textSecondary },
  summaryValue: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
});
