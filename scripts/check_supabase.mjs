import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://encdegylezyqbitongjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuY2RlZ3lsZXp5cWJpdG9uZ2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTM1MzksImV4cCI6MjA4NzA4OTUzOX0.Nwom46XItdfSkAKsyLri3Mx31F9umf8xZHyGPZHbe-w';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expected tables/views from the 10 migrations
const expected = [
  { name: 'profiles',           type: 'table', migration: '001' },
  { name: 'bets',               type: 'table', migration: '001' },
  { name: 'follows',            type: 'table', migration: '001' },
  { name: 'leaderboard',        type: 'view',  migration: '001' },
  { name: 'leaderboard_all_time', type: 'view', migration: '003' },
  { name: 'bankroll_settings',  type: 'table', migration: '004/010' },
  { name: 'bankroll_history',   type: 'table', migration: '004/010' },
  { name: 'live_scores',        type: 'table', migration: '006' },
];

// Check columns that should have been added by later migrations
const columnChecks = [
  { table: 'bets', column: 'odds_format',  migration: '001 (initial)' },
  { table: 'bets', column: 'market',        migration: '005' },
  { table: 'bets', column: 'league',        migration: '005' },
  { table: 'bets', column: 'source',        migration: '008' },
  { table: 'bets', column: 'archived',      migration: '009' },
];

console.log('=== Supabase Database Health Check ===\n');
console.log(`URL: ${SUPABASE_URL}\n`);

// 1. Check connectivity
console.log('--- Connectivity ---');
const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
if (sessionError) {
  console.log('❌ Cannot connect to Supabase:', sessionError.message);
  process.exit(1);
}
console.log('✅ Connected to Supabase\n');

// 2. Check each expected table/view
console.log('--- Tables & Views ---');
for (const item of expected) {
  try {
    const { data, error, status } = await supabase
      .from(item.name)
      .select('*', { count: 'exact', head: true });

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist') || status === 404) {
        console.log(`❌ ${item.name} (${item.type}) — MISSING (migration ${item.migration} not applied)`);
      } else if (error.code === 'PGRST301' || error.code === '42501') {
        // Permission denied but table exists
        console.log(`✅ ${item.name} (${item.type}) — exists (RLS active, no read access as anon)`);
      } else {
        console.log(`⚠️  ${item.name} (${item.type}) — error: ${error.message} [${error.code}]`);
      }
    } else {
      console.log(`✅ ${item.name} (${item.type}) — exists`);
    }
  } catch (e) {
    console.log(`❌ ${item.name} — unexpected error: ${e.message}`);
  }
}

// 3. Check specific columns on bets table
console.log('\n--- Bets Table Columns ---');
try {
  const { data, error } = await supabase.from('bets').select('*').limit(0);
  if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
    console.log('❌ bets table does not exist — cannot check columns');
  } else {
    // Try selecting each expected column
    for (const col of columnChecks) {
      try {
        const { error: colError } = await supabase
          .from(col.table)
          .select(col.column)
          .limit(0);
        
        if (colError && (colError.message?.includes('does not exist') || colError.code === '42703')) {
          console.log(`❌ bets.${col.column} — MISSING (migration ${col.migration})`);
        } else if (colError) {
          console.log(`⚠️  bets.${col.column} — error: ${colError.message}`);
        } else {
          console.log(`✅ bets.${col.column} — exists`);
        }
      } catch (e) {
        console.log(`⚠️  bets.${col.column} — check failed: ${e.message}`);
      }
    }
  }
} catch (e) {
  console.log('❌ Cannot check bets columns:', e.message);
}

// 4. Check Edge Functions
console.log('\n--- Edge Functions ---');
const edgeFunctions = ['fetch-live-scores', 'ocr-extract'];
for (const fnName of edgeFunctions) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: 'OPTIONS',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (res.status === 404) {
      console.log(`❌ ${fnName} — NOT DEPLOYED`);
    } else {
      console.log(`✅ ${fnName} — deployed (status: ${res.status})`);
    }
  } catch (e) {
    console.log(`⚠️  ${fnName} — cannot check: ${e.message}`);
  }
}

// 5. Check Realtime
console.log('\n--- Realtime ---');
try {
  const channel = supabase.channel('health_check');
  let realtimeOk = false;
  
  await new Promise((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        realtimeOk = true;
      }
      resolve();
    });
    setTimeout(resolve, 3000);
  });
  
  console.log(realtimeOk ? '✅ Realtime — connected' : '⚠️  Realtime — could not verify');
  channel.unsubscribe();
} catch (e) {
  console.log('⚠️  Realtime — check failed:', e.message);
}

console.log('\n=== Check Complete ===');
process.exit(0);
