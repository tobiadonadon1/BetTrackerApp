-- Ensure bets capture provenance + odds format for parlays

ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS odds_format text NOT NULL DEFAULT 'decimal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bets_odds_format_check'
  ) THEN
    ALTER TABLE public.bets
      ADD CONSTRAINT bets_odds_format_check
      CHECK (odds_format IN ('decimal','american'));
  END IF;
END $$;

UPDATE public.bets SET source = 'manual' WHERE source IS NULL;
UPDATE public.bets SET odds_format = 'decimal' WHERE odds_format IS NULL;
