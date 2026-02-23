const { Client } = require('pg');

const DB_PASSWORD = 'ou9gcz5IuCPBvmitbAgkrr9Oqryq3s265ZktZUD9s';
const connectionString = `postgresql://postgres:${DB_PASSWORD}@db.encdegylezyqbitongjk.supabase.co:5432/postgres`;

const sql = `
-- Add push_token to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Create table for notification history
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;

-- Policies for notifications
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Drop existing function and trigger if they exist
DROP TRIGGER IF EXISTS on_bet_status_change ON public.bets;
DROP FUNCTION IF EXISTS public.handle_bet_status_change();
`;

const functionSql = `
CREATE OR REPLACE FUNCTION public.handle_bet_status_change()
RETURNS TRIGGER AS $func$
DECLARE
  v_profit NUMERIC;
  v_title TEXT;
  v_body TEXT;
BEGIN
  -- Only trigger when status changes from pending to won or lost
  IF OLD.status = 'pending' AND NEW.status IN ('won', 'lost') THEN
    -- Calculate profit/loss
    IF NEW.status = 'won' THEN
      v_profit := NEW.potential_win - NEW.stake;
      v_title := '🎉 Bet Won!';
      v_body := 'Your bet on ' || NEW.title || ' was WON! Profit: $' || ROUND(v_profit, 2);
    ELSE
      v_profit := -NEW.stake;
      v_title := '😞 Bet Lost';
      v_body := 'Your bet on ' || NEW.title || ' was LOST. Loss: $' || NEW.stake;
    END IF;

    -- Store notification
    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (
      NEW.user_id,
      v_title,
      v_body,
      'bet_result',
      jsonb_build_object(
        'bet_id', NEW.id,
        'bet_title', NEW.title,
        'status', NEW.status,
        'profit', v_profit
      )
    );
  END IF;

  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;
`;

const triggerSql = `
CREATE TRIGGER on_bet_status_change
  AFTER UPDATE ON public.bets
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.handle_bet_status_change();
`;

async function setupNotifications() {
  console.log('Setting up notifications database...\n');
  
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    
    console.log('Running notification migration...\n');
    await client.query(sql);
    await client.query(functionSql);
    await client.query(triggerSql);
    
    console.log('✅ Notification setup complete!');
    console.log('\n📊 Changes:');
    console.log('  ✅ Added push_token column to profiles');
    console.log('  ✅ Created notifications table');
    console.log('  ✅ Created bet status change trigger');
    console.log('  ✅ RLS policies configured');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

setupNotifications();
