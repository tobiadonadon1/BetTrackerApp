-- live_score_cache: persistent state for the live-score-notifier edge function.
-- Tracks last-seen score per fixture plus a notified_end flag so a finished
-- match never triggers more than one "match ended" push per user.

CREATE TABLE IF NOT EXISTS public.live_score_cache (
  fixture_id    BIGINT PRIMARY KEY,
  home_score    INTEGER NOT NULL DEFAULT 0,
  away_score    INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'live',
  notified_end  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_score_cache_status
  ON public.live_score_cache (status);

-- Keep updated_at fresh on every upsert.
CREATE OR REPLACE FUNCTION public.touch_live_score_cache()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_live_score_cache ON public.live_score_cache;
CREATE TRIGGER trg_touch_live_score_cache
  BEFORE UPDATE ON public.live_score_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_live_score_cache();

-- RLS: service_role only (edge function uses service key, clients must not touch this).
ALTER TABLE public.live_score_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_score_cache_service_all" ON public.live_score_cache;
CREATE POLICY "live_score_cache_service_all" ON public.live_score_cache
  FOR ALL
  USING (current_setting('role', true) = 'service_role')
  WITH CHECK (current_setting('role', true) = 'service_role');
