import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Supabase configuration - BETRA Project
// Use env vars in production; fallback for local dev when .env is not configured
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://encdegylezyqbitongjk.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuY2RlZ3lsZXp5cWJpdG9uZ2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTM1MzksImV4cCI6MjA4NzA4OTUzOX0.Nwom46XItdfSkAKsyLri3Mx31F9umf8xZHyGPZHbe-w';

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('Using default Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env for production.');
}

// Custom storage adapter for React Native
const ExpoAsyncStorageAdapter = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

// Initialize Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoAsyncStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Database types
type Database = {
  public: {
    Tables: {
      bets: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          bookmaker: string;
          stake: number;
          total_odds: number;
          potential_win: number;
          status: 'pending' | 'won' | 'lost' | 'void';
          date: string;
          selections: any;
          notes: string | null;
          category: string;
          bet_type: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Tables['bets']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Tables['bets']['Row'], 'id' | 'created_at'>>;
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          username: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Tables['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Tables['profiles']['Row'], 'id' | 'created_at'>>;
      };
      follows: {
        Row: {
          id: string;
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: Omit<Tables['follows']['Row'], 'id' | 'created_at'>;
      };
    };
  };
};

export type Tables = Database['public']['Tables'];
export type BetRow = Tables['bets']['Row'];
export type ProfileRow = Tables['profiles']['Row'];
