-- Bankroll Management tables

-- Bankroll settings per user
CREATE TABLE IF NOT EXISTS bankroll_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  initial_bankroll numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Bankroll history (balance snapshots over time)
CREATE TABLE IF NOT EXISTS bankroll_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  balance numeric NOT NULL,
  snapshot_type text NOT NULL CHECK (snapshot_type IN ('initial', 'settled', 'manual')),
  bet_id uuid REFERENCES bets(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bankroll_settings_user ON bankroll_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_bankroll_history_user ON bankroll_history(user_id);
CREATE INDEX IF NOT EXISTS idx_bankroll_history_user_date ON bankroll_history(user_id, created_at);

-- Enable RLS
ALTER TABLE bankroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_history ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own records
CREATE POLICY "Users can view own bankroll settings"
  ON bankroll_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bankroll settings"
  ON bankroll_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bankroll settings"
  ON bankroll_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own bankroll settings"
  ON bankroll_settings FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own bankroll history"
  ON bankroll_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bankroll history"
  ON bankroll_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bankroll history"
  ON bankroll_history FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at on bankroll_settings
CREATE OR REPLACE FUNCTION update_bankroll_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bankroll_settings_updated_at
  BEFORE UPDATE ON bankroll_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_bankroll_settings_updated_at();
