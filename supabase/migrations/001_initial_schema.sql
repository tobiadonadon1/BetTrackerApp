-- Supabase Database Schema for BETRA App
-- Run these SQL commands in your Supabase SQL Editor

-- Enable Row Level Security
alter table auth.users enable row level security;

-- Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  username text not null unique,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- Profiles policies
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Bets table
create table if not exists public.bets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  bookmaker text not null,
  stake numeric not null,
  total_odds numeric not null,
  potential_win numeric not null,
  status text not null check (status in ('pending', 'won', 'lost', 'void')),
  date text not null,
  selections jsonb not null default '[]'::jsonb,
  notes text,
  category text not null,
  bet_type text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on bets
alter table public.bets enable row level security;

-- Bets policies
create policy "Users can view their own bets"
  on public.bets for select
  using (auth.uid() = user_id);

create policy "Users can insert their own bets"
  on public.bets for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own bets"
  on public.bets for update
  using (auth.uid() = user_id);

create policy "Users can delete their own bets"
  on public.bets for delete
  using (auth.uid() = user_id);

-- Follows table (for community feature)
create table if not exists public.follows (
  id uuid default gen_random_uuid() primary key,
  follower_id uuid references auth.users on delete cascade not null,
  following_id uuid references auth.users on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(follower_id, following_id)
);

-- Enable RLS on follows
alter table public.follows enable row level security;

-- Follows policies
create policy "Users can view follows"
  on public.follows for select
  using (true);

create policy "Users can follow others"
  on public.follows for insert
  with check (auth.uid() = follower_id);

create policy "Users can unfollow"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- Function to update updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql security definer;

-- Triggers for updated_at
create trigger on_profile_updated
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger on_bet_updated
  before update on public.bets
  for each row execute function public.handle_updated_at();

-- View for leaderboard stats
create or replace view public.leaderboard as
select 
  p.id,
  p.username,
  p.avatar_url,
  count(b.id) as total_bets,
  count(case when b.status = 'won' then 1 end) as won_bets,
  count(case when b.status = 'lost' then 1 end) as lost_bets,
  coalesce(sum(case when b.status = 'won' then b.potential_win - b.stake else 0 end), 0) -
  coalesce(sum(case when b.status = 'lost' then b.stake else 0 end), 0) as profit_loss,
  case 
    when count(case when b.status in ('won', 'lost') then 1 end) > 0 
    then round(
      count(case when b.status = 'won' then 1 end)::numeric / 
      count(case when b.status in ('won', 'lost') then 1 end) * 100, 
      2
    )
    else 0 
  end as win_rate,
  case 
    when coalesce(sum(b.stake), 0) > 0 
    then round(
      (coalesce(sum(case when b.status = 'won' then b.potential_win - b.stake else 0 end), 0) -
       coalesce(sum(case when b.status = 'lost' then b.stake else 0 end), 0)) / 
      sum(b.stake) * 100, 
      2
    )
    else 0 
  end as roi
from public.profiles p
left join public.bets b on p.id = b.user_id
where b.created_at > now() - interval '30 days' or b.id is null
group by p.id, p.username, p.avatar_url
order by profit_loss desc;

-- Realtime subscriptions
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;

alter publication supabase_realtime add table public.bets;
