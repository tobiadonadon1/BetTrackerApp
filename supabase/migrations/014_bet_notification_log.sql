-- bet_notification_log: durable dedup across cron runs for the live-score-notifier.
-- The unique (bet_id, event_key) constraint turns "already pushed?" into an atomic
-- INSERT ... ON CONFLICT DO NOTHING. If the insert succeeds, we send the push;
-- if it conflicts, a prior run already notified that exact event for that bet.

CREATE TABLE IF NOT EXISTS public.bet_notification_log (
  id          BIGSERIAL PRIMARY KEY,
  bet_id      UUID    NOT NULL REFERENCES public.bets(id) ON DELETE CASCADE,
  user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key   TEXT    NOT NULL,
  event_type  TEXT    NOT NULL,
  payload     JSONB   NOT NULL DEFAULT '{}'::jsonb,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bet_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_bet_notification_log_user
  ON public.bet_notification_log (user_id, notified_at DESC);

CREATE INDEX IF NOT EXISTS idx_bet_notification_log_bet
  ON public.bet_notification_log (bet_id);

ALTER TABLE public.bet_notification_log ENABLE ROW LEVEL SECURITY;

-- service_role full access (edge function uses service key)
DROP POLICY IF EXISTS "bet_notification_log_service_all" ON public.bet_notification_log;
CREATE POLICY "bet_notification_log_service_all"
  ON public.bet_notification_log
  FOR ALL
  USING (current_setting('role', true) = 'service_role')
  WITH CHECK (current_setting('role', true) = 'service_role');

-- Let the owning user read their own log (optional in-app feed)
DROP POLICY IF EXISTS "bet_notification_log_select_own" ON public.bet_notification_log;
CREATE POLICY "bet_notification_log_select_own"
  ON public.bet_notification_log
  FOR SELECT
  USING (auth.uid() = user_id);
