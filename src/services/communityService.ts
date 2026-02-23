import { supabase } from '../config/supabase';

export interface LeaderboardUser {
  id: string;
  username: string;
  totalBets: number;
  winRate: number;
  profitLoss: number;
  roi: number;
  rank: number;
  isFollowing: boolean;
  avatarUrl?: string;
}

class CommunityService {
  async getLeaderboard(currentUserId?: string, timeframe: '30d' | 'all' = '30d'): Promise<LeaderboardUser[]> {
    // Get leaderboard data - use 'leaderboard' (30-day) when 'leaderboard_all_time' not migrated
    let leaderboard: any[] | null = null;
    let error: { message: string } | null = null;

    if (timeframe === 'all') {
      const allTime = await supabase.from('leaderboard_all_time').select('*').limit(50);
      if (!allTime.error) {
        leaderboard = allTime.data;
      }
    }

    if (leaderboard === null) {
      const res = await supabase.from('leaderboard').select('*').limit(50);
      leaderboard = res.data;
      error = res.error;
    }

    if (error) {
      throw new Error(error.message);
    }

    // Get current user's follows if logged in
    let followingIds: Set<string> = new Set();
    if (currentUserId) {
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', currentUserId);
      
      followingIds = new Set(follows?.map(f => f.following_id) || []);
    }

    return (leaderboard || []).map((row, index) => ({
      id: row.id,
      username: row.username,
      totalBets: parseInt(row.total_bets) || 0,
      winRate: parseFloat(row.win_rate) || 0,
      profitLoss: parseFloat(row.profit_loss) || 0,
      roi: parseFloat(row.roi) || 0,
      rank: index + 1,
      isFollowing: followingIds.has(row.id),
      avatarUrl: row.avatar_url,
    }));
  }

  async followUser(userId: string): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Not authenticated');
    }

    const { error } = await supabase
      .from('follows')
      .insert({
        follower_id: session.user.id,
        following_id: userId,
      });

    if (error) {
      throw new Error(error.message);
    }
  }

  async unfollowUser(userId: string): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Not authenticated');
    }

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', session.user.id)
      .eq('following_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }

  async getFollowersCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    return count || 0;
  }

  async getFollowingCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    return count || 0;
  }
}

export default new CommunityService();
