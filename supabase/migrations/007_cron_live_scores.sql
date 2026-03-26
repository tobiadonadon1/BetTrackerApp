-- Cron job to fetch live scores every minute via Edge Function
-- Requires pg_cron and pg_net extensions (enabled by default on Supabase Pro+)
--
-- If pg_cron/pg_net are not available on your plan, set up an external cron:
--   URL: https://encdegylezyqbitongjk.supabase.co/functions/v1/fetch-live-scores
--   Method: POST
--   Header: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuY2RlZ3lsZXp5cWJpdG9uZ2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTM1MzksImV4cCI6MjA4NzA4OTUzOX0.Nwom46XItdfSkAKsyLri3Mx31F9umf8xZHyGPZHbe-w
--   Interval: every 1 minute
--   Services: cron-job.org, EasyCron, or GitHub Actions scheduled workflow

-- Try to enable extensions (will succeed on Pro plan, no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Schedule the cron job: every minute, call the Edge Function
SELECT cron.schedule(
  'fetch-live-scores',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://encdegylezyqbitongjk.supabase.co/functions/v1/fetch-live-scores',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuY2RlZ3lsZXp5cWJpdG9uZ2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTM1MzksImV4cCI6MjA4NzA4OTUzOX0.Nwom46XItdfSkAKsyLri3Mx31F9umf8xZHyGPZHbe-w'
    ),
    body := '{}'::jsonb
  );
  $$
);
