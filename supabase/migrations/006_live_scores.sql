-- Live scores table for real-time match data from The Odds API
CREATE TABLE IF NOT EXISTS live_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text UNIQUE NOT NULL,
  sport_key text NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  home_score integer DEFAULT 0,
  away_score integer DEFAULT 0,
  completed boolean DEFAULT false,
  last_update timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookup by event_id
CREATE INDEX IF NOT EXISTS idx_live_scores_event_id ON live_scores(event_id);

-- Index for filtering active (non-completed) games
CREATE INDEX IF NOT EXISTS idx_live_scores_completed ON live_scores(completed) WHERE completed = false;

-- Enable RLS
ALTER TABLE live_scores ENABLE ROW LEVEL SECURITY;

-- Public read access (anon can SELECT)
CREATE POLICY "live_scores_select_public" ON live_scores
  FOR SELECT USING (true);

-- Only service_role can INSERT
CREATE POLICY "live_scores_insert_service" ON live_scores
  FOR INSERT WITH CHECK (
    current_setting('role') = 'service_role'
    OR (SELECT current_user) = 'supabase_admin'
  );

-- Only service_role can UPDATE
CREATE POLICY "live_scores_update_service" ON live_scores
  FOR UPDATE USING (
    current_setting('role') = 'service_role'
    OR (SELECT current_user) = 'supabase_admin'
  );

-- Enable realtime for live_scores
ALTER PUBLICATION supabase_realtime ADD TABLE live_scores;
