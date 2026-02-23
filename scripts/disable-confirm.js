const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://encdegylezyqbitongjk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuY2RlZ3lsZXp5cWJpdG9uZ2prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUxMzUzOSwiZXhwIjoyMDg3MDg5NTM5fQ.Au-3c8C-_q8EaFZjIil69muiVYokwHY_VLH3ZIRDrvM';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function disableEmailConfirmation() {
  console.log('Attempting to disable email confirmation...\n');
  
  // Try to update auth config via the admin API
  // Note: This requires the service_role key
  
  const { data, error } = await supabase.auth.admin.updateUserById(
    '00000000-0000-0000-0000-000000000000', // dummy - just testing
    { email_confirm: true }
  );
  
  if (error) {
    console.log('Admin API test:', error.message);
  }
  
  console.log('\n⚠️  To disable email confirmation, you must use the Supabase Dashboard:');
  console.log('1. Go to https://supabase.com/dashboard/project/encdegylezyqbitongjk');
  console.log('2. Click "Authentication" in left sidebar');
  console.log('3. Click "Providers" tab');
  console.log('4. Find "Email" provider and click it');
  console.log('5. Toggle OFF "Confirm email"');
  console.log('6. Click "Save"');
  console.log('\nAlternative: Use the SQL Editor to disable:');
  console.log('```sql');
  console.log('UPDATE auth.config SET confirm_email = false;');
  console.log('```');
}

disableEmailConfirmation();
