import { useState, useEffect, useCallback } from 'react';
import communityService, { LeaderboardUser } from '../services/communityService';
import { useAuth } from './useAuth';

export function useCommunity(timeframe: '30d' | 'all' = '30d') {
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const loadLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Pass current user ID to get proper follow status
      const data = await communityService.getLeaderboard(user?.id, timeframe);
      setLeaderboard(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [user?.id, timeframe]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const followUser = useCallback(async (userId: string) => {
    try {
      setError(null);
      await communityService.followUser(userId);
      setLeaderboard(prev => prev.map(u => 
        u.id === userId ? { ...u, isFollowing: true } : u
      ));
    } catch (err: any) {
      setError(err.message || 'Failed to follow user');
      throw err;
    }
  }, []);

  const unfollowUser = useCallback(async (userId: string) => {
    try {
      setError(null);
      await communityService.unfollowUser(userId);
      setLeaderboard(prev => prev.map(u => 
        u.id === userId ? { ...u, isFollowing: false } : u
      ));
    } catch (err: any) {
      setError(err.message || 'Failed to unfollow user');
      throw err;
    }
  }, []);

  return {
    leaderboard,
    loading,
    error,
    followUser,
    unfollowUser,
    refresh: loadLeaderboard,
  };
}
