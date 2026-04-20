-- Schedule the live-score-notifier edge function to run every minute.
-- Requires pg_cron + pg_net (available on Supabase Pro+).
--
-- If pg_cron is not available on your plan, use an external scheduler:
--   URL:     https://encdegylezyqbitongjk.supabase.co/functions/v1/live-score-notifier
--   Method:  POST
--   Header:  Authorization: Bearer <service_role or anon key>
--   Period:  every 1 minute

CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net  SCHEMA extensions;

-- Drop any previous registration so re-running this migration is idempotent.
SELECT cron.unschedule('live-score-notifier')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-score-notifier');

SELECT cron.schedule(
  'live-score-notifier',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://encdegylezyqbitongjk.supabase.co/functions/v1/live-score-notifier',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuY2RlZ3lsZXp5cWJpdG9uZ2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTM1MzksImV4cCI6MjA4NzA4OTUzOX0.Nwom46XItdfSkAKsyLri3Mx31F9umf8xZHyGPZHbe-w'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
