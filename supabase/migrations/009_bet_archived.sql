-- User-controlled archive (Home swipe-to-archive); replaces implicit date-only split
alter table public.bets add column if not exists archived boolean not null default false;
