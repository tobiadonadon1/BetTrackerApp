import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { LeaderboardUser } from '../types';

const MOCK_USERS: LeaderboardUser[] = [
  { id: '1', username: 'BetKing', totalBets: 245, winRate: 68, profitLoss: 12500, roi: 15.2, rank: 1, isFollowing: false },
  { id: '2', username: 'SportsGuru', totalBets: 189, winRate: 64, profitLoss: 9800, roi: 12.8, rank: 2, isFollowing: true },
  { id: '3', username: 'LuckyStreak', totalBets: 312, winRate: 61, profitLoss: 8200, roi: 10.5, rank: 3, isFollowing: false },
  { id: '4', username: 'AnalystPro', totalBets: 156, winRate: 58, profitLoss: 6500, roi: 9.2, rank: 4, isFollowing: false },
  { id: '5', username: 'UnderdogHunter', totalBets: 203, winRate: 52, profitLoss: 4800, roi: 7.8, rank: 5, isFollowing: true },
];

export default function CommunityScreen() {
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'following'>('leaderboard');
  const [users, setUsers] = useState<LeaderboardUser[]>(MOCK_USERS);
  const [searchQuery, setSearchQuery] = useState('');

  const handleFollow = (userId: string) => {
    setUsers(prev => prev.map(user =>
      user.id === userId ? { ...user, isFollowing: !user.isFollowing } : user
    ));
    const user = users.find(u => u.id === userId);
    if (user) {
      Alert.alert(user.isFollowing ? 'Unfollowed' : 'Following', user.username);
    }
  };

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const followingUsers = users.filter(user => user.isFollowing);
  const displayUsers = activeTab === 'leaderboard' ? filteredUsers : followingUsers;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Community</Text>
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

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === 'leaderboard' && styles.tabActive]} onPress={() => setActiveTab('leaderboard')}>
          <Text style={[styles.tabText, activeTab === 'leaderboard' && styles.tabTextActive]}>Leaderboard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'following' && styles.tabActive]} onPress={() => setActiveTab('following')}>
          <Text style={[styles.tabText, activeTab === 'following' && styles.tabTextActive]}>Following ({followingUsers.length})</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {displayUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>{activeTab === 'following' ? 'Not Following Anyone' : 'No Users Found'}</Text>
            <Text style={styles.emptyText}>
              {activeTab === 'following' ? 'Follow users from the Leaderboard to see them here.' : 'Try a different search term.'}
            </Text>
          </View>
        ) : (
          displayUsers.map(user => (
            <View key={user.id} style={styles.userCard}>
              <View style={styles.userInfo}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{user.rank}</Text>
                </View>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{user.username[0]}</Text>
                </View>
                <View style={styles.userDetails}>
                  <Text style={styles.username}>{user.username}</Text>
                  <Text style={styles.userStats}>Win: {user.winRate}% • {user.totalBets} bets</Text>
                </View>
              </View>
              <View style={styles.userActions}>
                <Text style={styles.profitText}>+${user.profitLoss.toLocaleString()}</Text>
                <TouchableOpacity
                  style={[styles.followButton, user.isFollowing && styles.followingButton]}
                  onPress={() => handleFollow(user.id)}
                >
                  <Text style={[styles.followText, user.isFollowing && styles.followingText]}>
                    {user.isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: colors.textPrimary },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 16, color: colors.textPrimary },
  tabContainer: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.border },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.accent },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 40 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginTop: 16 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  userCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, marginBottom: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  userInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rankBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rankText: { fontSize: 12, fontWeight: 'bold', color: colors.accent },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 20, fontWeight: 'bold', color: colors.primary },
  userDetails: { flex: 1 },
  username: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary },
  userStats: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  userActions: { alignItems: 'flex-end' },
  profitText: { fontSize: 16, fontWeight: 'bold', color: colors.success, marginBottom: 8 },
  followButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.accent },
  followingButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent },
  followText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  followingText: { color: colors.accent },
});
