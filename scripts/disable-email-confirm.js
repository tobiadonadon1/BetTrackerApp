const { Client } = require('pg');

const DB_PASSWORD = 'ou9gcz5IuCPBvmitbAgkrr9Oqryq3s265ZktZUD9s';
const connectionString = `postgresql://postgres:${DB_PASSWORD}@db.encdegylezyqbitongjk.supabase.co:5432/postgres`;

const sql = `
-- Create a function to auto-confirm users on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-confirm the user's email
  UPDATE auth.users
  SET email_confirmed_at = NOW(),
      confirmed_at = NOW()
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-confirm users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Also disable email confirmation requirement via auth config (if possible)
-- Note: This requires supabase_admin or postgres role
`;

async function setupAutoConfirm() {
  console.log('Connecting to database to disable email confirmation...\n');
  
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    
    console.log('Creating auto-confirm trigger...\n');
    await client.query(sql);
    
    console.log('✅ Email confirmation disabled!');
    console.log('\nAll new users will be auto-confirmed on signup.');
    console.log('No email verification required.');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('\n⚠️  You may need to disable email confirmation manually:');
    console.log('1. Visit: https://supabase.com/dashboard/project/encdegylezyqbitongjk');
    console.log('2. Go to Authentication → Providers → Email');
    console.log('3. Toggle OFF "Confirm email"');
  } finally {
    await client.end();
  }
}

setupAutoConfirm();
