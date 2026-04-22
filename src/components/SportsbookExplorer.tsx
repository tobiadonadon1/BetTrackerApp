import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, FlatList,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from '../contexts/LanguageContext';
import { colors } from '../constants/colors';
import oddsApiService, { Sport, OddsApiEvent, MarketOdds } from '../services/oddsApiService';
import { BetType } from '../types';

import { MARKET_CATEGORIES, getMarketsByCategory } from '../constants/betMarkets';

interface SportsbookExplorerProps {
  visible: boolean;
  onClose: () => void;
  onSelectSelection: (eventTitle: string, selectionName: string, odds: number, leagueName?: string) => void;
  onSelectEventOnly?: (eventTitle: string, leagueName?: string) => void;
  /** Pass the current bet type so we can show the right selector UI */
  betType?: BetType;
  onBetTypeChange?: (bt: BetType) => void;
}

type Step = 'SPORTS' | 'EVENTS' | 'MARKETS';

const BET_TYPE_OPTIONS: { value: BetType; label: string; desc: string; color: string }[] = [
  { value: 'classica',    label: 'Classica',    desc: '1 selezione',         color: '#4ADE80' },
  { value: 'combo',       label: 'Combo',       desc: 'Tutte devono vincere', color: '#60A5FA' },
  { value: 'chance-mix',  label: 'Chance Mix',  desc: 'Basta una vincente',   color: '#F59E0B' },
];

export default function SportsbookExplorer({
  visible,
  onClose,
  onSelectSelection,
  onSelectEventOnly,
  betType: externalBetType,
  onBetTypeChange,
}: SportsbookExplorerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('SPORTS');

  const [sports, setSports]                 = useState<Sport[]>([]);
  const [favorites, setFavorites]           = useState<string[]>([]);
  const [selectedSport, setSelectedSport]   = useState<Sport | null>(null);

  const [events, setEvents]                 = useState<OddsApiEvent[]>([]);
  const [selectedEvent, setSelectedEvent]   = useState<OddsApiEvent | null>(null);

  const [markets, setMarkets]               = useState<MarketOdds[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const [loading, setLoading]               = useState(false);
  const [searchQuery, setSearchQuery]       = useState('');

  // Internal bet type (can be controlled externally or used standalone)
  const [internalBetType, setInternalBetType] = useState<BetType>(externalBetType || 'classica');
  const activeBetType = externalBetType ?? internalBetType;

  // Track multi-selections for Combo/Chance Mix
  const [comboPicks, setComboPicks] = useState<{name: string, price: number}[]>([]);

  const handleBetTypeChange = (bt: BetType) => {
    setInternalBetType(bt);
    onBetTypeChange?.(bt);
  };

  // Initial load
  useEffect(() => {
    if (visible && step === 'SPORTS' && sports.length === 0) {
      loadSports();
      loadFavorites();
    }
  }, [visible, step]);

  // Sync external betType
  useEffect(() => {
    if (externalBetType) setInternalBetType(externalBetType);
  }, [externalBetType]);

  const loadFavorites = async () => {
    try {
      const favs = await AsyncStorage.getItem('favoriteLeagues');
      if (favs) setFavorites(JSON.parse(favs));
    } catch (e) {}
  };

  const toggleFavorite = async (sportKey: string) => {
    let newFavs = [...favorites];
    if (newFavs.includes(sportKey)) {
      newFavs = newFavs.filter(k => k !== sportKey);
    } else {
      newFavs.push(sportKey);
    }
    setFavorites(newFavs);
    try {
      await AsyncStorage.setItem('favoriteLeagues', JSON.stringify(newFavs));
    } catch (e) {}
  };

  const loadSports = async () => {
    setLoading(true);
    const data = await oddsApiService.getActiveSports();
    const sorted = [...data].sort((a, b) => {
      const aFav = favorites.includes(a.key);
      const bFav = favorites.includes(b.key);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.title.localeCompare(b.title);
    });
    setSports(sorted);
    setLoading(false);
  };

  const handleSportSelect = async (sport: Sport) => {
    setSelectedSport(sport);
    setSearchQuery('');
    setStep('EVENTS');
    setLoading(true);
    const evts = await oddsApiService.getEventsForSport(sport.key);
    setEvents(evts);
    setLoading(false);
  };

  const handleEventSelect = async (event: OddsApiEvent) => {
    setSelectedEvent(event);
    setComboPicks([]); // Reset picks
    setStep('MARKETS');
    setLoading(true);
    const mkts = await oddsApiService.getOddsForEvent(event.sport_key, event.id);
    setMarkets(mkts);
    setLoading(false);
  };

  const handleSelection = (outcome: any) => {
    if (!selectedEvent) return;
    const eventName = `${selectedEvent.home_team} vs ${selectedEvent.away_team}`;
    let selectionName = outcome.name;
    if (outcome.point) {
      const sign = outcome.point > 0 ? '+' : '';
      selectionName += ` ${sign}${outcome.point}`;
    }
    const priceNum = parseFloat(outcome.price) || 0;

    if (activeBetType === 'classica') {
      onSelectSelection(eventName, selectionName, outcome.price, selectedSport?.title);
      setStep('SPORTS');
      setSearchQuery('');
      setComboPicks([]);
      onClose();
    } else {
      // Toggle selection in builder
      setComboPicks(prev => {
        const exists = prev.find(p => p.name === selectionName);
        if (exists) return prev.filter(p => p.name !== selectionName);
        return [...prev, { name: selectionName, price: priceNum }];
      });
    }
  };

  const handleConfirmCombo = () => {
    if (!selectedEvent || comboPicks.length === 0) return;
    const eventName = `${selectedEvent.home_team} vs ${selectedEvent.away_team}`;
    const separator = activeBetType === 'combo' ? ' + ' : ' o ';
    const joinedName = comboPicks.map(p => p.name).join(separator);
    
    // For combo, multiply decimal odds. For chance-mix, pass 0 since odds aren't simply multiplicative
    const productOdds = activeBetType === 'combo' 
      ? comboPicks.reduce((acc, p) => acc * (p.price || 1), 1)
      : undefined;

    onSelectSelection(eventName, joinedName, productOdds || 0, selectedSport?.title);
    setStep('SPORTS');
    setSearchQuery('');
    setComboPicks([]);
    onClose();
  };

  const goBack = () => {
    if (step === 'MARKETS') { setStep('EVENTS'); setSearchQuery(''); setComboPicks([]); }
    else if (step === 'EVENTS') { setStep('SPORTS'); setSearchQuery(''); }
    else onClose();
  };

  // ─── SPORTS LIST ───
  const renderSports = () => {
    const filtered = sports.filter(s =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.group.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    return (
      <View style={styles.listContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('searchLeague') || 'Search League or Sport...'}
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <FlatList
          data={filtered}
          keyExtractor={item => item.key}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          renderItem={({ item }) => {
            const isFav = favorites.includes(item.key);
            return (
              <TouchableOpacity style={styles.listItem} onPress={() => handleSportSelect(item)}>
                <View style={styles.listItemTextContainer}>
                  <Text style={styles.listItemTitle}>{item.title}</Text>
                  <Text style={styles.listItemSub}>{item.group}</Text>
                </View>
                <TouchableOpacity onPress={() => toggleFavorite(item.key)} style={styles.favButton}>
                  <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={22} color={isFav ? colors.error : colors.textMuted} />
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  };

  // ─── EVENTS LIST ───
  const renderEvents = () => {
    const filtered = events.filter(e =>
      e.home_team.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.away_team.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    return (
      <View style={styles.listContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('searchTeam') || 'Search Team or Match...'}
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {events.length === 0 && !loading ? (
          <Text style={styles.emptyText}>{t('noUpcomingMatches') || 'No upcoming matches found for this league.'}</Text>
        ) : null}
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.listItem} onPress={() => handleEventSelect(item)}>
              <View style={styles.listItemTextContainer}>
                <Text style={styles.listItemTitle}>{item.home_team} vs {item.away_team}</Text>
                <Text style={styles.listItemSub}>{new Date(item.commence_time).toLocaleString()}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      </View>
    );
  };

  // ─── MARKETS (Available Bets) ───
  const renderMarkets = () => {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        {/* ── Match Title ── */}
        <View style={styles.matchHeader}>
          <Text style={styles.matchTitle}>
            {selectedEvent?.home_team} vs {selectedEvent?.away_team}
          </Text>
          {selectedEvent && (
            <Text style={styles.matchSubtitle}>
              {new Date(selectedEvent.commence_time).toLocaleString('it-IT', {
                weekday: 'short', day: '2-digit', month: 'short',
                hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          )}
        </View>

        {/* ── COMBO/CHANCE MIX SUMMARY ── */}
        {comboPicks.length > 0 && activeBetType !== 'classica' && (
          <View style={styles.comboSummaryContainer}>
            <Text style={styles.comboSummaryLabel}>
              {activeBetType === 'combo' ? 'Combo in costruzione:' : 'Chance Mix in costruzione:'}
            </Text>
            <View style={styles.comboChipsWrapper}>
              {comboPicks.map(p => (
                <TouchableOpacity
                  key={p.name}
                  style={styles.comboChip}
                  onPress={() => handleSelection({ name: p.name, price: p.price })}
                >
                  <Text style={styles.comboChipText}>{p.name}</Text>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} style={styles.comboChipIcon} />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.comboConfirmBtn} onPress={handleConfirmCombo}>
              <Text style={styles.comboConfirmBtnText}>Conferma ({comboPicks.length})</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── BET TYPE SELECTOR: 3 large cards ── */}
        <View style={styles.betTypeCardRow}>
          {BET_TYPE_OPTIONS.map(opt => {
            const isActive = activeBetType === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.betTypeCard,
                  isActive && { borderColor: opt.color, backgroundColor: opt.color + '1A' },
                ]}
                onPress={() => handleBetTypeChange(opt.value)}
                activeOpacity={0.75}
              >
                {/* Top colored indicator bar */}
                <View style={[styles.betTypeCardBar, { backgroundColor: isActive ? opt.color : 'transparent' }]} />
                <Text style={[styles.betTypeCardLabel, isActive && { color: opt.color }]}>
                  {opt.label}
                </Text>
                <Text style={styles.betTypeCardDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── REAL ODDS FROM API ── */}
        {markets.length > 0 && (
          <View style={styles.marketsListContainer}>
            <Text style={styles.sectionHeading}>Live Odds</Text>
            {markets.map(market => (
              <View key={market.key} style={styles.marketCard}>
                <Text style={styles.marketTitle}>{market.key.toUpperCase().replace(/_/g, ' ')}</Text>
                <View style={styles.outcomesGrid}>
                  {market.outcomes.map((outcome, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.outcomeButton}
                      onPress={() => handleSelection(outcome)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.outcomeName} numberOfLines={1}>{outcome.name}</Text>
                      {outcome.point !== undefined && (
                        <Text style={styles.outcomePoint}>
                          {outcome.point > 0 ? '+' : ''}{outcome.point}
                        </Text>
                      )}
                      <Text style={styles.outcomePrice}>@{outcome.price.toFixed(2)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── PREDEFINED MANUAL MARKETS (Scegli Mercato) ── */}
        <View style={styles.manualMarketsContainer}>
          <Text style={styles.sectionHeading}>
            {markets.length === 0 ? 'Scegli Mercato' : 'Altre Scommesse (Manuale)'}
          </Text>
          {markets.length === 0 && (
            <Text style={styles.manualMarketsSub}>
              Le quote live non sono disponibili per questo evento. Seleziona l'esito qui sotto per aggiungerlo manualmente.
            </Text>
          )}

          {MARKET_CATEGORIES.map(cat => {
            const isExpanded = expandedCategory === cat.key;
            const marketsList = getMarketsByCategory(cat.key);
            
            return (
              <View key={cat.key} style={styles.categoryCard}>
                <TouchableOpacity
                  style={styles.categoryHeader}
                  onPress={() => setExpandedCategory(isExpanded ? null : cat.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.categoryTitle, isExpanded && { color: colors.accent }]}>
                    {cat.label.toUpperCase()}
                  </Text>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={isExpanded ? colors.accent : colors.textMuted} />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.categoryContent}>
                    {marketsList.map(mkt => (
                      <View key={mkt.id} style={styles.standardMarketBlock}>
                        <Text style={styles.standardMarketLabel}>{mkt.label}</Text>
                        <View style={styles.outcomesGridEmpty}>
                          {mkt.options.map((opt, i) => {
                            const needsPrefix = !['1X2', 'Doppia chance', 'Under / Over', 'Gol / NoGol'].includes(mkt.label);
                            const selectionName = needsPrefix ? `${mkt.label} ${opt}` : opt;
                            return (
                              <TouchableOpacity
                                key={i}
                                style={styles.outcomeButtonEmpty}
                                onPress={() => handleSelection({ name: selectionName, price: '' })}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.outcomeNameEmpty}>{opt}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>

      </ScrollView>
    );
  };

  let title = t('selectSport') || 'Select Sport/League';
  if (step === 'EVENTS') title = selectedSport?.title || 'Matches';
  if (step === 'MARKETS') title = t('availableBets') || 'Available Bets';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 10 : insets.top + 10 }]}>
          <TouchableOpacity onPress={goBack} style={styles.iconButton}>
            <Ionicons name={step === 'SPORTS' ? 'close' : 'arrow-back'} size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <View style={{ width: 42 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>{t('fetchingLive') || 'Fetching live data...'}</Text>
          </View>
        ) : (
          <>
            {step === 'SPORTS'  && renderSports()}
            {step === 'EVENTS'  && renderEvents()}
            {step === 'MARKETS' && renderMarkets()}
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconButton:   { padding: 8 },
  headerTitle:  { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, flex: 1, textAlign: 'center' },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:  { color: colors.textMuted, marginTop: 12 },

  // Lists
  listContainer: { flex: 1, padding: 16 },
  searchInput: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 10,
    color: colors.textPrimary,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listItemTextContainer: { flex: 1 },
  listItemTitle: { fontSize: 16, color: colors.textPrimary, fontWeight: '600' },
  listItemSub:   { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  favButton:     { padding: 8 },
  emptyText:     { color: colors.textMuted, textAlign: 'center', marginTop: 40 },

  // Match header
  matchHeader: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  matchTitle:    { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginHorizontal: 20 },
  matchSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4 },

  comboSummaryContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  comboSummaryLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  comboChipsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  comboChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  comboChipText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  comboChipIcon: {
    marginLeft: 6,
  },
  comboConfirmBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  comboConfirmBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },

  // ─── BET TYPE CARDS ───
  betTypeCardRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 24,
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

  // Markets
  marketsListContainer: { paddingHorizontal: 16 },
  marketCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  marketTitle:  { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 12, letterSpacing: 0.5 },
  outcomesGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  outcomeButton: {
    backgroundColor: colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: '30%',
    flex: 1,
  },
  outcomeName:   { fontSize: 13, color: colors.textPrimary, fontWeight: '500', marginBottom: 2 },
  outcomePoint:  { fontSize: 12, color: colors.accent, fontWeight: '600' },
  outcomePrice:  { fontSize: 13, color: colors.primary, fontWeight: 'bold' },

  // Manual Markets (Scegli Mercato)
  manualMarketsContainer: { paddingHorizontal: 16, marginTop: 10, paddingBottom: 20 },
  sectionHeading: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 12, marginLeft: 16 },
  manualMarketsSub: { fontSize: 13, color: colors.textMuted, marginBottom: 16, lineHeight: 18 },
  categoryCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  categoryTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  categoryContent: { padding: 16, paddingTop: 0, backgroundColor: colors.surface },
  standardMarketBlock: { marginBottom: 16 },
  standardMarketLabel: { fontSize: 14, color: colors.textPrimary, fontWeight: '600', marginBottom: 8 },
  outcomesGridEmpty: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  outcomeButtonEmpty: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  outcomeNameEmpty: { fontSize: 13, color: colors.textPrimary },

  emptyContainer: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 16 },
  useEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  useEventButtonText: { fontSize: 14, fontWeight: '700', color: colors.primary },
});
