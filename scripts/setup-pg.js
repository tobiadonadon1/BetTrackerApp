const { Client } = require('pg');

// Use the database password we created the project with
const DB_PASSWORD = 'ou9gcz5IuCPBvmitbAgkrr9Oqryq3s265ZktZUD9s';
const connectionString = `postgresql://postgres:${DB_PASSWORD}@db.encdegylezyqbitongjk.supabase.co:5432/postgres`;

const sql = `
-- Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  username text not null unique,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

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

alter table public.bets enable row level security;

drop policy if exists "Users can view their own bets" on public.bets;
create policy "Users can view their own bets" on public.bets for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own bets" on public.bets;
create policy "Users can insert their own bets" on public.bets for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own bets" on public.bets;
create policy "Users can update their own bets" on public.bets for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own bets" on public.bets;
create policy "Users can delete their own bets" on public.bets for delete using (auth.uid() = user_id);

-- Follows table
create table if not exists public.follows (
  id uuid default gen_random_uuid() primary key,
  follower_id uuid references auth.users on delete cascade not null,
  following_id uuid references auth.users on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(follower_id, following_id)
);

alter table public.follows enable row level security;

drop policy if exists "Users can view follows" on public.follows;
create policy "Users can view follows" on public.follows for select using (true);

drop policy if exists "Users can follow others" on public.follows;
create policy "Users can follow others" on public.follows for insert with check (auth.uid() = follower_id);

drop policy if exists "Users can unfollow" on public.follows;
create policy "Users can unfollow" on public.follows for delete using (auth.uid() = follower_id);

-- Function to update updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql security definer;

-- Triggers
drop trigger if exists on_profile_updated on public.profiles;
create trigger on_profile_updated
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists on_bet_updated on public.bets;
create trigger on_bet_updated
  before update on public.bets
  for each row execute function public.handle_updated_at();

-- Leaderboard view
drop view if exists public.leaderboard;
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

-- Realtime
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;

alter publication supabase_realtime add table public.bets;
`;

async function setupDatabase() {
  console.log('Connecting to Supabase PostgreSQL...\n');
  
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    
    console.log('Running migrations...\n');
    await client.query(sql);
    
    console.log('✅ Database setup complete!');
    console.log('\n📊 Tables created:');
    console.log('  ✅ profiles');
    console.log('  ✅ bets');
    console.log('  ✅ follows');
    console.log('  ✅ leaderboard (view)');
    console.log('\n🔒 Policies configured:');
    console.log('  ✅ RLS enabled on all tables');
    console.log('  ✅ Users can only access their own data');
    console.log('  ✅ Profiles are publicly viewable');
    console.log('\n🚀 Realtime enabled for bets table');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.message.includes('authentication failed')) {
      console.log('\n⚠️  Note: Database password may not be active yet.');
      console.log('New Supabase projects can take 1-2 minutes to fully initialize.');
    }
    console.log('\n📋 Manual fallback:');
    console.log('1. Visit: https://supabase.com/dashboard/project/encdegylezyqbitongjk');
    console.log('2. Go to SQL Editor → New query');
    console.log('3. Paste: supabase/migrations/001_initial_schema.sql');
    console.log('4. Click Run');
  } finally {
    await client.end();
  }
}

setupDatabase();
