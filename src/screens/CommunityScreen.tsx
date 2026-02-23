import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { useCommunity } from '../hooks';
import AppBackground from '../components/AppBackground';
import PageHeader from '../components/PageHeader';

type Tab = 'leaderboard' | 'following';

interface Tip {
  id: string;
  icon: string;
  title: string;
  summary: string;
  detail: string;
  takeaway: string;
}

const BETTING_TIPS: Tip[] = [
  {
    id: '1',
    icon: 'wallet',
    title: 'Bankroll Management',
    summary: 'Protect your capital with strict unit sizing.',
    detail: 'Allocate a fixed bankroll for betting and never bet more than 1–2% of it on a single wager. This approach limits losses during cold streaks and keeps you in the game long enough to capitalize on hot streaks. Professional bettors often use even smaller units (0.5–1%) for higher variance markets.',
    takeaway: '1–2% per bet max. Track your bankroll separately from daily funds.',
  },
  {
    id: '2',
    icon: 'analytics',
    title: 'Track Every Bet',
    summary: 'Data reveals what intuition misses.',
    detail: 'Log every bet—stake, odds, category, outcome, and notes. Over time you\'ll see which sports, bet types, and bookmakers perform best for you. Many bettors discover they lose money on parlays but profit on singles, or that certain categories consistently underperform. BETRA helps you spot these patterns.',
    takeaway: 'Review your stats monthly. Double down on what works, cut what doesn\'t.',
  },
  {
    id: '3',
    icon: 'shield-checkmark',
    title: 'Never Chase Losses',
    summary: 'Emotional betting destroys bankrolls.',
    detail: 'After a loss, the urge to "win it back" leads to larger, riskier bets. Chasing rarely works and often compounds losses. Stick to your unit size regardless of recent results. If you\'re on tilt, take a break—even pros step away when emotions run high.',
    takeaway: 'One unit per bet, win or lose. Walk away when frustrated.',
  },
  {
    id: '4',
    icon: 'git-compare',
    title: 'Shop for the Best Odds',
    summary: 'Odds vary across bookmakers—exploit it.',
    detail: 'The same game can have different odds at different sportsbooks. A -110 vs -105 line might seem small, but over hundreds of bets that 5% edge compounds significantly. Use odds comparison tools and maintain accounts at multiple books. Closing line value (getting better odds than the closing line) is a key profitability indicator.',
    takeaway: 'Compare odds before every bet. Even small edges add up over time.',
  },
  {
    id: '5',
    icon: 'trending-up',
    title: 'Bet for Value, Not Favorites',
    summary: 'Winning bets aren\'t always winning games.',
    detail: 'Value exists when the odds underestimate the true probability of an outcome. You can lose a bet and still have made a +EV (expected value) decision. Focus on finding mispriced lines rather than picking "sure things." Favorites are often overbet—underdogs and plus-money plays frequently offer better value.',
    takeaway: 'Ask: "Do the odds reflect the real probability?" Bet when they don\'t.',
  },
  {
    id: '6',
    icon: 'time',
    title: 'Line Shopping & Timing',
    summary: 'When you bet matters as much as what you bet.',
    detail: 'Lines move as sharp money comes in. Betting early can lock in value before the market corrects—or you can wait for late steam moves if you have a strong read. Avoid betting right after line opens (often soft) or right before close (often sharp). Find your edge in the middle.',
    takeaway: 'Track when you place bets. Identify your best performing time windows.',
  },
];

export default function CommunityScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('leaderboard');
  const [timeframe, setTimeframe] = useState<'30d' | 'all'>('30d');
  const [searchQuery, setSearchQuery] = useState('');
  const [tipsModalVisible, setTipsModalVisible] = useState(false);
  const { leaderboard, loading, error, followUser, unfollowUser, refresh } = useCommunity(timeframe);

  const handleFollow = async (userId: string, isCurrentlyFollowing: boolean) => {
    try {
      if (isCurrentlyFollowing) {
        await unfollowUser(userId);
        Alert.alert('Unfollowed', 'You unfollowed this user');
      } else {
        await followUser(userId);
        Alert.alert('Following', 'You are now following this user');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update follow status');
    }
  };

  const filteredLeaderboard = leaderboard.filter(u =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const followingUsers = leaderboard.filter(u => u.isFollowing);

  return (
    <View style={styles.container}>
      <AppBackground />
      <PageHeader title="Community" />

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'leaderboard' && styles.tabActive]}
          onPress={() => setActiveTab('leaderboard')}
        >
          <Text style={[styles.tabText, activeTab === 'leaderboard' && styles.tabTextActive]}>Leaderboard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'following' && styles.tabActive]}
          onPress={() => setActiveTab('following')}
        >
          <Text style={[styles.tabText, activeTab === 'following' && styles.tabTextActive]}>Following ({followingUsers.length})</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'leaderboard' && (
          <>
            <View style={styles.timeframeRow}>
              <TouchableOpacity
                style={[styles.timeframeBtn, timeframe === '30d' && styles.timeframeBtnActive]}
                onPress={() => setTimeframe('30d')}
              >
                <Text style={[styles.timeframeText, timeframe === '30d' && styles.timeframeTextActive]}>Last 30 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeframeBtn, timeframe === 'all' && styles.timeframeBtnActive]}
                onPress={() => setTimeframe('all')}
              >
                <Text style={[styles.timeframeText, timeframe === 'all' && styles.timeframeTextActive]}>All Time</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.quickActions}>
              <TouchableOpacity style={styles.quickActionBtn} onPress={() => setActiveTab('following')}>
                <View style={styles.quickActionIcon}>
                  <Ionicons name="people" size={22} color={colors.accent} />
                </View>
                <Text style={styles.quickActionText}>Following</Text>
                <Text style={styles.quickActionCount}>{followingUsers.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionBtn} onPress={() => setTipsModalVisible(true)}>
                <View style={[styles.quickActionIcon, styles.quickActionIconAccent]}>
                  <Ionicons name="bulb" size={22} color="#0B1B3D" />
                </View>
                <Text style={styles.quickActionText}>Tips</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search users..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {loading && leaderboard.length === 0 ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.loadingText}>Loading leaderboard...</Text>
              </View>
            ) : error ? (
              <View style={styles.emptyState}>
                <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Leaderboard unavailable</Text>
                <Text style={styles.emptyText}>{error}</Text>
                <Text style={styles.emptyHint}>Leaderboard requires an active connection.</Text>
                <TouchableOpacity style={styles.retryButton} onPress={refresh}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : filteredLeaderboard.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No users found</Text>
                <Text style={styles.emptyText}>Try a different search term.</Text>
              </View>
            ) : (
              filteredLeaderboard.map(user => (
                <View key={user.id} style={styles.userCard}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{user.rank}</Text>
                  </View>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{user.username[0]}</Text>
                  </View>
                  <View style={styles.userDetails}>
                    <Text style={styles.username}>{user.username}</Text>
                    <Text style={styles.userStats}>{user.winRate}% win • {user.totalBets} bets</Text>
                  </View>
                  <View style={styles.userActions}>
                    <Text style={[styles.profitText, user.profitLoss < 0 && styles.lossText]}>
                      {user.profitLoss >= 0 ? '+' : ''}${user.profitLoss.toLocaleString()}
                    </Text>
                    <TouchableOpacity
                      style={[styles.followBtn, user.isFollowing && styles.followingBtn]}
                      onPress={() => handleFollow(user.id, user.isFollowing)}
                    >
                      <Text style={[styles.followBtnText, user.isFollowing && styles.followingBtnText]}>
                        {user.isFollowing ? 'Following' : 'Follow'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'following' && (
          <>
            {followingUsers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Not following anyone</Text>
                <Text style={styles.emptyText}>Follow users from the Leaderboard to see their activity here.</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={() => setActiveTab('leaderboard')}>
                  <Text style={styles.primaryButtonText}>Go to Leaderboard</Text>
                </TouchableOpacity>
              </View>
            ) : (
              followingUsers.map(user => (
                <View key={user.id} style={styles.userCard}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{user.username[0]}</Text>
                  </View>
                  <View style={styles.userDetails}>
                    <Text style={styles.username}>{user.username}</Text>
                    <Text style={styles.userStats}>{user.winRate}% win • {user.totalBets} bets</Text>
                  </View>
                  <View style={styles.userActions}>
                    <Text style={[styles.profitText, user.profitLoss < 0 && styles.lossText]}>
                      {user.profitLoss >= 0 ? '+' : ''}${user.profitLoss.toLocaleString()}
                    </Text>
                    <TouchableOpacity
                      style={[styles.followBtn, styles.followingBtn]}
                      onPress={() => handleFollow(user.id, user.isFollowing)}
                    >
                      <Text style={styles.followingBtnText}>Unfollow</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal
        visible={tipsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setTipsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalTitleIcon}>
                  <Ionicons name="bulb" size={24} color="#0B1B3D" />
                </View>
                <Text style={styles.modalTitle}>Betting Tips</Text>
              </View>
              <TouchableOpacity onPress={() => setTipsModalVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.tipsScroll} showsVerticalScrollIndicator={false}>
              {BETTING_TIPS.map((tip, index) => (
                <View key={tip.id} style={styles.tipCard}>
                  <View style={styles.tipCardHeader}>
                    <View style={styles.tipNumber}>
                      <Text style={styles.tipNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.tipCardTitle}>{tip.title}</Text>
                  </View>
                  <Text style={styles.tipSummary}>{tip.summary}</Text>
                  <Text style={styles.tipDetail}>{tip.detail}</Text>
                  <View style={styles.takeawayBox}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <Text style={styles.takeawayText}>{tip.takeaway}</Text>
                  </View>
                </View>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },

  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(27, 56, 102, 0.5)',
    borderRadius: 12,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: 'rgba(135, 206, 235, 0.25)' },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.accent },

  timeframeRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  timeframeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.22)',
    backgroundColor: 'rgba(27, 56, 102, 0.4)',
  },
  timeframeBtnActive: {
    backgroundColor: colors.accent + '25',
    borderColor: colors.accent,
  },
  timeframeText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  timeframeTextActive: {
    color: colors.accent,
  },

  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(27, 56, 102, 0.62)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.22)',
    gap: 10,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accent + '25',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionIconAccent: {
    backgroundColor: colors.accent,
  },
  quickActionText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  quickActionCount: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.accent,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(27, 56, 102, 0.6)',
    marginBottom: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.2)',
  },
  searchInput: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 16, color: colors.textPrimary },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(27, 56, 102, 0.62)',
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.22)',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent + '25',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  rankText: { fontSize: 11, fontWeight: 'bold', color: colors.accent },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: 'bold', color: colors.primary },
  userDetails: { flex: 1 },
  username: { fontSize: 15, fontWeight: 'bold', color: colors.textPrimary },
  userStats: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  userActions: { alignItems: 'flex-end' },
  profitText: { fontSize: 15, fontWeight: 'bold', color: colors.success, marginBottom: 6 },
  lossText: { color: colors.error },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.accent,
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  followBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  followingBtnText: { fontSize: 12, fontWeight: '600', color: colors.accent },

  emptyState: { alignItems: 'center', padding: 32, marginTop: 24 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginTop: 16 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  emptyHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  retryButton: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.accent, borderRadius: 10 },
  retryText: { color: colors.primary, fontWeight: 'bold' },
  primaryButton: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.accent, borderRadius: 10 },
  primaryButtonText: { color: colors.primary, fontWeight: 'bold' },

  loadingContainer: { alignItems: 'center', padding: 40 },
  loadingText: { color: colors.textMuted, marginTop: 16, fontSize: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0a1428',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalTitleIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: 0.5 },
  modalClose: { padding: 8 },
  tipsScroll: { paddingHorizontal: 20, paddingTop: 20 },

  tipCard: {
    backgroundColor: 'rgba(27, 56, 102, 0.5)',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.15)',
  },
  tipCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12 },
  tipNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipNumberText: { fontSize: 14, fontWeight: '800', color: colors.accent },
  tipCardTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  tipSummary: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  tipDetail: {
    fontSize: 14,
    color: 'rgba(190, 210, 240, 0.9)',
    lineHeight: 22,
    marginBottom: 12,
  },
  takeawayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  takeawayText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
});
