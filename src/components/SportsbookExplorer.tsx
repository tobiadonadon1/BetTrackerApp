import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, FlatList, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from '../contexts/LanguageContext';
import { colors } from '../constants/colors';
import oddsApiService, { Sport, OddsApiEvent, MarketOdds } from '../services/oddsApiService';

interface SportsbookExplorerProps {
  visible: boolean;
  onClose: () => void;
  onSelectSelection: (eventTitle: string, selectionName: string, odds: number) => void;
}

type Step = 'SPORTS' | 'EVENTS' | 'MARKETS';

export default function SportsbookExplorer({ visible, onClose, onSelectSelection }: SportsbookExplorerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('SPORTS');
  
  const [sports, setSports] = useState<Sport[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);
  
  const [events, setEvents] = useState<OddsApiEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<OddsApiEvent | null>(null);
  
  const [markets, setMarkets] = useState<MarketOdds[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Initial load
  useEffect(() => {
    if (visible && step === 'SPORTS' && sports.length === 0) {
      loadSports();
      loadFavorites();
    }
  }, [visible, step]);

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
    
    // Sort so favorites are first
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
    setStep('EVENTS');
    setLoading(true);
    const evts = await oddsApiService.getEventsForSport(sport.key);
    setEvents(evts);
    setLoading(false);
  };

  const handleEventSelect = async (event: OddsApiEvent) => {
    setSelectedEvent(event);
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
    onSelectSelection(eventName, selectionName, outcome.price);
    // Reset and close
    setStep('SPORTS');
    setSearchQuery('');
    onClose();
  };

  const goBack = () => {
    if (step === 'MARKETS') setStep('EVENTS');
    else if (step === 'EVENTS') setStep('SPORTS');
    else onClose();
  };

  // Render Sports / Leagues List
  const renderSports = () => {
    const filteredSports = sports.filter(s => 
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.group.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <View style={styles.listContainer}>
        <TextInput 
          style={styles.searchInput}
          placeholder={t('searchLeague') || "Search League or Sport..."}
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <FlatList
          data={filteredSports}
          keyExtractor={item => item.key}
          renderItem={({ item }) => {
            const isFav = favorites.includes(item.key);
            return (
              <TouchableOpacity style={styles.listItem} onPress={() => handleSportSelect(item)}>
                <View style={styles.listItemTextContainer}>
                  <Text style={styles.listItemTitle}>{item.title}</Text>
                  <Text style={styles.listItemSub}>{item.group}</Text>
                </View>
                <TouchableOpacity onPress={() => toggleFavorite(item.key)} style={styles.favButton}>
                  <Ionicons name={isFav ? "heart" : "heart-outline"} size={22} color={isFav ? colors.error : colors.textMuted} />
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            )
          }}
        />
      </View>
    );
  };

  // Render Event List for a sport
  const renderEvents = () => {
    const filteredEvents = events.filter(e => 
      e.home_team.toLowerCase().includes(searchQuery.toLowerCase()) || 
      e.away_team.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <View style={styles.listContainer}>
        <TextInput 
          style={styles.searchInput}
          placeholder={t('searchTeam') || "Search Team or Match..."}
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {events.length === 0 && !loading ? (
          <Text style={styles.emptyText}>{t('noUpcomingMatches') || "No upcoming matches found for this league."}</Text>
        ) : null}
        <FlatList
          data={filteredEvents}
          keyExtractor={item => item.id}
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

  // Render Market options
  const renderMarkets = () => {
    return (
      <View style={styles.listContainer}>
        <View style={styles.matchHeader}>
          <Text style={styles.matchTitle}>{selectedEvent?.home_team} vs {selectedEvent?.away_team}</Text>
        </View>
        {markets.length === 0 && !loading ? (
          <Text style={styles.emptyText}>{t('noOddsAvailable') || "No odds available at the moment. Try manually typing."}</Text>
        ) : null}
        <FlatList
          data={markets}
          keyExtractor={item => item.key}
          renderItem={({ item }) => (
            <View style={styles.marketCard}>
              <Text style={styles.marketTitle}>{item.key.toUpperCase().replace('_', ' ')}</Text>
              <View style={styles.outcomesGrid}>
                {item.outcomes.map((outcome, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={styles.outcomeButton}
                    onPress={() => handleSelection(outcome)}
                  >
                    <Text style={styles.outcomeName} numberOfLines={1}>{outcome.name}</Text>
                    {outcome.point !== undefined && (
                      <Text style={styles.outcomePoint}>{outcome.point > 0 ? '+' : ''}{outcome.point}</Text>
                    )}
                    <Text style={styles.outcomePrice}>@{outcome.price.toFixed(2)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        />
      </View>
    );
  };

  let title = t('selectSport') || "Select Sport/League";
  if (step === 'EVENTS') title = selectedSport?.title || "Matches";
  if (step === 'MARKETS') title = t('availableBets') || "Available Bets";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 10 : insets.top + 10 }]}>
          <TouchableOpacity onPress={goBack} style={styles.iconButton}>
            <Ionicons name={step === 'SPORTS' ? 'close' : 'arrow-back'} size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <View style={{ width: 42 }} /> {/* balance */}
        </View>

        {loading ? (
          <View style={styles.center}>
             <ActivityIndicator size="large" color={colors.accent} />
             <Text style={styles.loadingText}>{t('fetchingLive') || "Fetching live data..."}</Text>
          </View>
        ) : (
          <>
            {step === 'SPORTS' && renderSports()}
            {step === 'EVENTS' && renderEvents()}
            {step === 'MARKETS' && renderMarkets()}
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingBottom: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: colors.border,
    backgroundColor: colors.surface
  },
  iconButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, flex: 1, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textMuted, marginTop: 12 },
  listContainer: { flex: 1, padding: 16 },
  searchInput: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 10,
    color: colors.textPrimary,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  listItemTextContainer: { flex: 1 },
  listItemTitle: { fontSize: 16, color: colors.textPrimary, fontWeight: '600' },
  listItemSub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  favButton: { padding: 8 },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  matchHeader: { marginBottom: 20, alignItems: 'center' },
  matchTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, textAlign: 'center' },
  marketCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border
  },
  marketTitle: { fontSize: 14, fontWeight: '700', color: colors.accent, marginBottom: 12, letterSpacing: 0.5 },
  outcomesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  outcomeButton: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: 'rgba(11, 27, 61, 0.5)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(45, 74, 111, 0.6)',
    alignItems: 'center'
  },
  outcomeName: { fontSize: 13, color: colors.textPrimary, marginBottom: 4, textAlign: 'center' },
  outcomePoint: { fontSize: 13, color: colors.pending, marginBottom: 4, fontWeight: 'bold' },
  outcomePrice: { fontSize: 15, fontWeight: 'bold', color: colors.success }
});
