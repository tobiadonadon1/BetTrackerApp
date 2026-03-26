CREATE TABLE IF NOT EXISTS public.bankroll_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  initial_bankroll numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bankroll_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  balance numeric NOT NULL,
  snapshot_type text NOT NULL CHECK (snapshot_type IN ('initial', 'settled', 'manual')),
  bet_id uuid REFERENCES public.bets(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bankroll_settings_user ON public.bankroll_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_bankroll_history_user ON public.bankroll_history(user_id);
CREATE INDEX IF NOT EXISTS idx_bankroll_history_user_date ON public.bankroll_history(user_id, created_at);

ALTER TABLE public.bankroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bankroll_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bankroll_settings'
      AND policyname = 'Users can view own bankroll settings'
  ) THEN
    CREATE POLICY "Users can view own bankroll settings"
      ON public.bankroll_settings FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bankroll_settings'
      AND policyname = 'Users can insert own bankroll settings'
  ) THEN
    CREATE POLICY "Users can insert own bankroll settings"
      ON public.bankroll_settings FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bankroll_settings'
      AND policyname = 'Users can update own bankroll settings'
  ) THEN
    CREATE POLICY "Users can update own bankroll settings"
      ON public.bankroll_settings FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bankroll_settings'
      AND policyname = 'Users can delete own bankroll settings'
  ) THEN
    CREATE POLICY "Users can delete own bankroll settings"
      ON public.bankroll_settings FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bankroll_history'
      AND policyname = 'Users can view own bankroll history'
  ) THEN
    CREATE POLICY "Users can view own bankroll history"
      ON public.bankroll_history FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bankroll_history'
      AND policyname = 'Users can insert own bankroll history'
  ) THEN
    CREATE POLICY "Users can insert own bankroll history"
      ON public.bankroll_history FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bankroll_history'
      AND policyname = 'Users can delete own bankroll history'
  ) THEN
    CREATE POLICY "Users can delete own bankroll history"
      ON public.bankroll_history FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_bankroll_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'bankroll_settings_updated_at'
  ) THEN
    CREATE TRIGGER bankroll_settings_updated_at
      BEFORE UPDATE ON public.bankroll_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.update_bankroll_settings_updated_at();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
