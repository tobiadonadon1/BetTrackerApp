-- Add push_token to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Create table for notification history (optional, for tracking)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL, -- 'bet_result', 'system', etc.
  data JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies for notifications
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to send push notification via Expo Push API
CREATE OR REPLACE FUNCTION public.send_push_notification(
  p_user_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
DECLARE
  v_push_token TEXT;
BEGIN
  -- Get user's push token
  SELECT push_token INTO v_push_token
  FROM public.profiles
  WHERE id = p_user_id;

  -- Store notification in history
  INSERT INTO public.notifications (user_id, title, body, type, data)
  VALUES (p_user_id, p_title, p_body, COALESCE(p_data->>'type', 'system'), p_data);

  -- Note: Actual push delivery requires HTTP call to Expo Push API
  -- This would typically be done via a serverless function or edge function
  -- The push token is stored for external service to pick up
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle bet status changes and send notifications
CREATE OR REPLACE FUNCTION public.handle_bet_status_change()
RETURNS TRIGGER AS $$
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

    -- Store notification (external service will deliver push)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for bet status changes
DROP TRIGGER IF EXISTS on_bet_status_change ON public.bets;
CREATE TRIGGER on_bet_status_change
  AFTER UPDATE ON public.bets
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.handle_bet_status_change();

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
