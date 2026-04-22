import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, FlatList, ActivityIndicator, SectionList, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { BetCategory, BetType, BetMarket, BetSelection, OddsFormat } from '../types';
import { useBets, useSubscription } from '../hooks';
import { parseOddsInput, oddsInputFromStored } from '../utils/odds';
import { useTranslation } from '../contexts/LanguageContext';
import { ITALIAN_MARKETS, MARKET_CATEGORIES, MarketDefinition, getMarketsByCategory } from '../constants/betMarkets';
import oddsApiService, { OddsApiEvent } from '../services/oddsApiService';

interface AddBetScreenProps {
  navigation: any;
  route: any;
}

const CATEGORIES: BetCategory[] = ['NBA', 'NFL', 'MLB', 'NHL', 'Soccer', 'Tennis', 'UFC', 'Boxing', 'Golf', 'Other'];
const BOOKMAKERS = ['Sisal', 'Better', 'Eplay24', 'GoldBet', 'DomusBet', 'Snai', 'Other'];

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

import SportsbookExplorer from '../components/SportsbookExplorer';

export default function AddBetScreen({ navigation, route }: AddBetScreenProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { createBet, updateBet, bets } = useBets();
  const { canUseFeature, isOverLimit, ticketCount, limits, openPaywall, tier, loading: subLoading } = useSubscription();
  // While subscription is loading, assume OCR is available to avoid blocking VIP/pro
  const ocrAvailable = subLoading || canUseFeature('ocrEnabled');
  const editingBet = route.params?.bet;

  const [betType, setBetType] = useState<BetType>(editingBet?.betType || 'classica');
  const [marketPickerVisible, setMarketPickerVisible] = useState(false);
  const [marketPickerTarget, setMarketPickerTarget] = useState<string | 'single' | null>(null);
  const [expandedMarket, setExpandedMarket] = useState<string | null>(null);
  const [title, setTitle] = useState(editingBet?.title || '');
  const [bookmaker, setBookmaker] = useState(editingBet?.bookmaker || '');
  const [bookmakerModalVisible, setBookmakerModalVisible] = useState(false);
  const [stake, setStake] = useState(editingBet?.stake?.toString() || '');
  const [odds, setOdds] = useState(() => {
    if (!editingBet) return '';
    return oddsInputFromStored(editingBet.totalOdds, editingBet.oddsFormat ?? 'decimal');
  });
  const [category, setCategory] = useState<BetCategory>(editingBet?.category || 'Other');
  const [league, setLeague] = useState(editingBet?.league || '');
  const [singleSelection, setSingleSelection] = useState(editingBet?.selections?.[0]?.selection || '');

  // Sportsbook Explorer State
  const [explorerVisible, setExplorerVisible] = useState(false);
  const [activeLegTarget, setActiveLegTarget] = useState<string | 'single' | null>(null);

  // Pre-fetch some upcoming matches when tab mounts
  useEffect(() => {
    oddsApiService.getActiveSports(); // Prefetch sports list
  }, []);

  const BET_TYPES: { value: BetType; label: string; desc: string }[] = [
    { value: 'classica', label: 'Classica', desc: '1 selezione' },
    { value: 'combo', label: 'Combo', desc: '2+ AND (tutte devono vincere)' },
    { value: 'chance-mix', label: 'Chance Mix', desc: '2+ OR (basta una)' },
  ];

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

  const isMultiLeg = betType === 'parlay' || betType === 'teaser' || betType === 'round-robin';

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
    // Check ticket limit for free users (not when editing)
    if (!editingBet && isOverLimit) {
      openPaywall(`Free plan limit reached (${limits.maxTickets} tickets). Upgrade to save more bets.`);
      return;
    }

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
          market: 'other',
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
          selection: singleSelection.trim() || trimmedTitle,
          odds: Number(parsed.decimal.toFixed(4)),
          oddsFormat: parsed.format,
          status: 'pending' as const,
          category,
          market: (() => {
            const sel = (singleSelection.trim() || '').toLowerCase();
            if (/^(over|under)\s*\d/.test(sel)) return 'totals';
            return 'other';
          })(),
        }];
        betOddsFormat = parsed.format;
      }

      const betTypeLabel = betType === 'chance-mix' ? 'Chance Mix' : betType.charAt(0).toUpperCase() + betType.slice(1);
      const betTitle = isMultiLeg
        ? `${betTypeLabel} (${selections.length} legs)`
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
        market: 'other' as BetMarket,
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
        if (Platform.OS !== 'web') {
          import('../services/notificationService').then(m => m.default.initialize(true));
        }
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
        <Text style={styles.headerTitle}>{editingBet ? t('editBet') : t('addBet')}</Text>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save Bet"
        >
          <Text style={styles.saveText}>{t('save')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        {!editingBet && (
          <View style={styles.scanActionsRow}>
            <TouchableOpacity
              style={[styles.scanTicketButton, styles.scanTicketButtonHalf, !ocrAvailable && styles.disabledButton]}
              onPress={() => {
                if (!ocrAvailable) {
                  openPaywall('OCR Bet Scanning is a Pro feature. Upgrade to scan tickets automatically.');
                  return;
                }
                navigation.navigate('ScanTicket', { mode: 'camera' });
              }}
              accessibilityRole="button"
            >
              <Ionicons name="camera" size={20} color={!ocrAvailable ? colors.textMuted : colors.primary} />
              <Text style={[styles.scanTicketText, !ocrAvailable && { color: colors.textMuted }]} numberOfLines={1}>{t('scanTicket')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.uploadTicketButton, styles.scanTicketButtonHalf, !ocrAvailable && styles.disabledButton]}
              onPress={() => {
                if (!ocrAvailable) {
                  openPaywall('OCR Bet Scanning is a Pro feature. Upgrade to scan tickets automatically.');
                  return;
                }
                navigation.navigate('ScanTicket', { mode: 'gallery' });
              }}
              accessibilityRole="button"
            >
              <Ionicons name="images" size={20} color={!ocrAvailable ? colors.textMuted : colors.accent} />
              <Text style={[styles.uploadTicketText, !ocrAvailable && { color: colors.textMuted }]} numberOfLines={1}>{t('uploadGallery')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {!editingBet && (
          <Text style={styles.scanHint}>{t('scanTicket')} {t('worksAnyLanguage')}</Text>
        )}

        {/* Subscription inline warnings */}
        {!editingBet && !ocrAvailable && (
          <Text style={styles.upgradeWarning}>
            OCR scanning requires Pro. Upgrade to scan tickets →
          </Text>
        )}
        {!editingBet && isOverLimit && (
          <Text style={styles.upgradeWarning}>
            Free plan limit reached ({limits.maxTickets} tickets). Upgrade to Pro →
          </Text>
        )}

        {/* Bet Type Selector (3 Large Cards) */}
        <Text style={styles.label}>Bet Type</Text>
        <View style={styles.betTypeCardRow}>
          {BET_TYPES.map((bt) => {
            const isActive = betType === bt.value;
            // Map colors based on the bet type like in SportsbookExplorer
            let color = colors.accent; // Default
            if (bt.value === 'classica') color = '#4ADE80';
            else if (bt.value === 'combo') color = '#60A5FA';
            else if (bt.value === 'chance-mix') color = '#F59E0B';

            return (
              <TouchableOpacity
                key={bt.value}
                style={[
                  styles.betTypeCard,
                  isActive && { borderColor: color, backgroundColor: color + '1A' },
                ]}
                onPress={() => setBetType(bt.value)}
                activeOpacity={0.75}
              >
                {/* Top colored indicator bar */}
                <View style={[styles.betTypeCardBar, { backgroundColor: isActive ? color : 'transparent' }]} />
                <Text style={[styles.betTypeCardLabel, isActive && { color }]}>
                  {bt.label}
                </Text>
                <Text style={styles.betTypeCardDesc}>{bt.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Bookmaker Modal Picker */}
        <Text style={styles.label}>{t('bookmaker')} *</Text>
        <TouchableOpacity 
          style={styles.input} 
          onPress={() => setBookmakerModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={{ color: bookmaker ? colors.textPrimary : colors.textMuted }}>
            {bookmaker || t('selectBookmaker')}
          </Text>
        </TouchableOpacity>

        {/* Single bet fields */}
        {!isMultiLeg && (
          <>
            <View style={styles.eventRowWrapper}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t('event')} *</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 0 }]}
                  placeholder={t('searchEvent')}
                  placeholderTextColor={colors.textMuted}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>
              <TouchableOpacity
                style={styles.browseSportsbookBtnSmall}
                onPress={() => { setActiveLegTarget('single'); setExplorerVisible(true); }}
              >
                <Ionicons name="search" size={20} color={colors.accent} />
              </TouchableOpacity>
            </View>

            <View style={styles.row}>
              <View style={styles.flex1}>
                <Text style={styles.label}>{t('selection') || 'Selection'} *</Text>
                <View style={styles.eventRowWrapper}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder={t('egSelection') || 'e.g. Manchester United to Win'}
                    placeholderTextColor={colors.textMuted}
                    value={singleSelection}
                    onChangeText={setSingleSelection}
                  />
                  <TouchableOpacity
                    style={styles.browseSportsbookBtnSmall}
                    onPress={() => { setMarketPickerTarget('single'); setMarketPickerVisible(true); }}
                  >
                    <Ionicons name="list" size={20} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex1]}
                placeholder={`${t('stake')} $`}
                placeholderTextColor={colors.textMuted}
                value={stake}
                onChangeText={setStake}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, styles.flex1]}
                placeholder={t('odds')}
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
              placeholder={`${t('stake')} $ *`}
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

                <View style={styles.eventRowWrapper}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder={t('searchEvent')}
                    placeholderTextColor={colors.textMuted}
                    value={leg.event}
                    onChangeText={(v) => updateLeg(leg.id, 'event', v)}
                  />
                  <TouchableOpacity
                    style={styles.browseSportsbookBtnSmall}
                    onPress={() => { setActiveLegTarget(leg.id); setExplorerVisible(true); }}
                  >
                    <Ionicons name="search" size={20} color={colors.accent} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.row, { marginTop: 12 }]}>
                  <TextInput
                    style={[styles.legInput, styles.flex1]}
                    placeholder={t('selection') || "Selection"}
                    placeholderTextColor={colors.textMuted}
                    value={leg.selection}
                    onChangeText={(v) => updateLeg(leg.id, 'selection', v)}
                  />
                  <TextInput
                    style={[styles.legInput, { width: 80 }]}
                    placeholder={t('odds')}
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
                  <Text style={styles.summaryLabel}>{t('potentialWin')}</Text>
                  <Text style={[styles.summaryValue, { color: colors.success }]}>
                    ${potentialWin.toFixed(2)}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Bookmaker Bottom Sheet */}
      <Modal visible={bookmakerModalVisible} animationType="slide" transparent onRequestClose={() => setBookmakerModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalBackdropTap} onPress={() => setBookmakerModalVisible(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('selectBookmaker')}</Text>
            <FlatList
              data={BOOKMAKERS}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.modalOption}
                  onPress={() => {
                    setBookmaker(item);
                    setBookmakerModalVisible(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{item}</Text>
                  {bookmaker === item && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalCancel} onPress={() => setBookmakerModalVisible(false)}>
              <Text style={styles.modalCancelText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SportsbookExplorer 
        visible={explorerVisible}
        betType={betType}
        onBetTypeChange={(bt) => setBetType(bt)}
        onClose={() => { setExplorerVisible(false); setActiveLegTarget(null); }}
        onSelectSelection={(eventName, selectionName, selectedOdds, leagueName) => {
          if (isMultiLeg) {
            if (activeLegTarget && activeLegTarget !== 'single') {
              updateLeg(activeLegTarget, 'event', eventName);
              updateLeg(activeLegTarget, 'selection', selectionName);
              updateLeg(activeLegTarget, 'odds', String(selectedOdds));
            } else {
              // Started as 'single', but changed to 'parlay' in the modal
              if (legs.length === 0) {
                setLegs([{ id: Date.now().toString(), event: eventName, selection: selectionName, odds: String(selectedOdds), category: category || 'Soccer' }]);
              } else {
                updateLeg(legs[0].id, 'event', eventName);
                updateLeg(legs[0].id, 'selection', selectionName);
                updateLeg(legs[0].id, 'odds', String(selectedOdds));
              }
            }
          } else {
            // Still single/classica/combo/chance-mix
            setTitle(eventName);
            setSingleSelection(selectionName);
            setOdds(String(selectedOdds));
            if (legs.length > 0) {
              updateLeg(legs[0].id, 'event', eventName);
              updateLeg(legs[0].id, 'selection', selectionName);
              updateLeg(legs[0].id, 'odds', String(selectedOdds));
            }
          }
          if (leagueName && !league) setLeague(leagueName);
        }}
        onSelectEventOnly={(eventName, leagueName) => {
          if (isMultiLeg) {
            if (activeLegTarget && activeLegTarget !== 'single') {
              updateLeg(activeLegTarget, 'event', eventName);
            } else {
              if (legs.length === 0) {
                setLegs([{ id: Date.now().toString(), event: eventName, selection: '', odds: '', category: category || 'Soccer' }]);
              } else {
                updateLeg(legs[0].id, 'event', eventName);
              }
            }
          } else {
            setTitle(eventName);
            if (legs.length > 0) updateLeg(legs[0].id, 'event', eventName);
          }
          if (leagueName && !league) setLeague(leagueName);
        }}
      />

      {/* Italian Betting Markets Picker */}
      <Modal visible={marketPickerVisible} animationType="slide" transparent onRequestClose={() => setMarketPickerVisible(false)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalBackdropTap} onPress={() => setMarketPickerVisible(false)} />
          <View style={[styles.modalSheet, { maxHeight: '80%' }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Scegli Mercato</Text>
            <ScrollView showsVerticalScrollIndicator>
              {MARKET_CATEGORIES.map(cat => {
                const markets = getMarketsByCategory(cat.key);
                if (markets.length === 0) return null;
                return (
                  <View key={cat.key} style={{ marginBottom: 16 }}>
                    <Text style={styles.marketCatHeader}>{cat.label}</Text>
                    {markets.map(mkt => (
                      <View key={mkt.id}>
                        <TouchableOpacity
                          style={styles.marketRow}
                          onPress={() => setExpandedMarket(expandedMarket === mkt.id ? null : mkt.id)}
                        >
                          <Text style={styles.marketRowLabel}>{mkt.label}</Text>
                          <Ionicons
                            name={expandedMarket === mkt.id ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={colors.textMuted}
                          />
                        </TouchableOpacity>
                        {expandedMarket === mkt.id && (
                          <View style={styles.marketOptions}>
                            {mkt.options.map((opt, idx) => (
                              <TouchableOpacity
                                key={idx}
                                style={styles.marketOption}
                                onPress={() => {
                                  const selectionText = `${mkt.label}: ${opt}`;
                                  if (marketPickerTarget === 'single') {
                                    setSingleSelection(selectionText);
                                  } else if (marketPickerTarget) {
                                    updateLeg(marketPickerTarget, 'selection', selectionText);
                                  }
                                  setMarketPickerVisible(false);
                                  setExpandedMarket(null);
                                }}
                              >
                                <Text style={styles.marketOptionText}>{opt}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? { maxHeight: '100vh' as any } : {}),
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  saveButton: { backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  saveText: { fontWeight: 'bold', color: colors.primary },
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web' ? { height: '100%', flexBasis: 0 } : {}),
  },
  content: { padding: 16, paddingBottom: 100, flexGrow: 1 },
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
  // ─── BET TYPE CARDS ───
  betTypeCardRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  betTypeCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    paddingBottom: 14,
    alignItems: 'center',
  },
  betTypeCardBar: {
    width: '100%',
    height: 4,
    marginBottom: 10,
  },
  betTypeCardLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  betTypeCardDesc: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 4,
    lineHeight: 13,
  },
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
  eventRowWrapper: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 12 },
  browseSportsbookBtnSmall: {
    height: 48,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 159, 212, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(74, 159, 212, 0.3)',
  },
  
  // Modal styles (bottom sheet design)
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBackdropTap: { flex: 1 },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    maxHeight: '70%',
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: colors.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 16, textAlign: 'center' },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  modalOptionText: { fontSize: 16, color: colors.textPrimary, fontWeight: '500' },
  modalCancel: { marginTop: 12, paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { color: colors.textMuted, fontSize: 16, fontWeight: '600' },
  upgradeWarning: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 16,
  },
  disabledButton: {
    opacity: 0.5,
  },
  // Market picker styles
  marketCatHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  marketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  marketRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  marketOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginBottom: 8,
  },
  marketOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(74, 159, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74, 159, 212, 0.25)',
  },
  marketOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
});

