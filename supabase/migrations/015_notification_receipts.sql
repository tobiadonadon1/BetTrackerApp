-- Track Expo push-receipt state on bet_notification_log so the edge function
-- can observe APNs/FCM delivery outcomes and invalidate dead tokens.
--
-- Expo's POST /push/send returns a "ticket" (immediate acceptance).
-- The real delivery status (ok / DeviceNotRegistered / MessageRateExceeded /
-- InvalidCredentials / MessageTooBig) only appears on GET /push/getReceipts
-- ~15 minutes later. We persist the ticket_id on send, then poll receipts on
-- a subsequent cron run.

ALTER TABLE public.bet_notification_log
  ADD COLUMN IF NOT EXISTS ticket_id          TEXT,
  ADD COLUMN IF NOT EXISTS receipt_status     TEXT,
  ADD COLUMN IF NOT EXISTS receipt_error      TEXT,
  ADD COLUMN IF NOT EXISTS receipt_checked_at TIMESTAMPTZ;

-- Partial index: the receipt-polling pass scans for rows that have a ticket
-- but no receipt yet. Partial keeps the index tiny (only ~minutes of rows).
CREATE INDEX IF NOT EXISTS idx_bet_notification_log_pending_receipt
  ON public.bet_notification_log (notified_at)
  WHERE ticket_id IS NOT NULL AND receipt_checked_at IS NULL;
