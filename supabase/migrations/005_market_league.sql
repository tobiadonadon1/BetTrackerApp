-- Add market and league columns to bets table
-- market: moneyline, spread, totals, other (default 'other' for backward compat)
-- league: optional text field for league/competition name

ALTER TABLE bets ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'other';
ALTER TABLE bets ADD COLUMN IF NOT EXISTS league text DEFAULT NULL;

-- Add check constraint for market values
ALTER TABLE bets ADD CONSTRAINT bets_market_check
  CHECK (market IN ('moneyline', 'spread', 'totals', 'other'));
