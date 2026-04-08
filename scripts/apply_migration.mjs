import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://encdegylezyqbitongjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuY2RlZ3lsZXp5cWJpdG9uZ2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTM1MzksImV4cCI6MjA4NzA4OTUzOX0.Nwom46XItdfSkAKsyLri3Mx31F9umf8xZHyGPZHbe-w';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Migration 005: Add market and league columns to bets
const sql = `
ALTER TABLE bets ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'other';
ALTER TABLE bets ADD COLUMN IF NOT EXISTS league text DEFAULT NULL;
`;

console.log('Running migration 005_market_league...');

const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql });

if (error) {
  console.log('Cannot run via RPC (expected — anon key has no exec_sql access).');
  console.log('Error:', error.message);
  console.log('\n⚠️  You need to run this SQL in your Supabase SQL Editor:');
  console.log('─'.repeat(60));
  console.log(sql);
  console.log('─'.repeat(60));
  console.log('\nGo to: https://supabase.com/dashboard → SQL Editor → paste and run');
} else {
  console.log('✅ Migration applied successfully!');
}

process.exit(0);
