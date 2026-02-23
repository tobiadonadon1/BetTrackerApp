const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://encdegylezyqbitongjk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuY2RlZ3lsZXp5cWJpdG9uZ2prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUxMzUzOSwiZXhwIjoyMDg3MDg5NTM5fQ.Au-3c8C-_q8EaFZjIil69muiVYokwHY_VLH3ZIRDrvM';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function testConnection() {
  console.log('Testing Supabase connection...\n');
  
  // Test auth
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.log('Auth error:', authError.message);
  } else {
    console.log('✅ Auth connected');
  }
  
  // Test if we can query (this will fail if tables don't exist)
  const { data: bets, error: betsError } = await supabase.from('bets').select('*').limit(1);
  if (betsError) {
    console.log('❌ Bets table not found:', betsError.message);
    console.log('\n⚠️  You need to run the SQL migration in Supabase Dashboard:');
    console.log('1. Go to https://supabase.com/dashboard/project/encdegylezyqbitongjk');
    console.log('2. Click "SQL Editor" in left sidebar');
    console.log('3. Paste the contents of supabase/migrations/001_initial_schema.sql');
    console.log('4. Click "Run"');
  } else {
    console.log('✅ Bets table exists');
  }
  
  console.log('\nProject URL:', SUPABASE_URL);
}

testConnection().catch(console.error);
