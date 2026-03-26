import { supabase } from '../config/supabase';

export interface LiveScore {
  id: string;
  event_id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  completed: boolean;
  last_update: string;
}

class LiveScoresService {
  async getActiveScores(): Promise<LiveScore[]> {
    const { data, error } = await supabase
      .from('live_scores')
      .select('*')
      .eq('completed', false)
      .order('last_update', { ascending: false });

    if (error) {
      console.warn('Failed to fetch live scores:', error.message);
      return [];
    }

    return (data || []) as LiveScore[];
  }

  async getAllRecentScores(): Promise<LiveScore[]> {
    const { data, error } = await supabase
      .from('live_scores')
      .select('*')
      .order('last_update', { ascending: false })
      .limit(100);

    if (error) {
      console.warn('Failed to fetch live scores:', error.message);
      return [];
    }

    return (data || []) as LiveScore[];
  }

  subscribeToScores(callback: (scores: LiveScore[]) => void) {
    return supabase
      .channel('live_scores_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_scores' },
        () => {
          // Re-fetch all active scores on any change
          this.getAllRecentScores().then(callback);
        }
      )
      .subscribe();
  }
}

export default new LiveScoresService();
