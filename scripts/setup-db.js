const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://encdegylezyqbitongjk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuY2RlZ3lsZXp5cWJpdG9uZ2prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUxMzUzOSwiZXhwIjoyMDg3MDg5NTM5fQ.Au-3c8C-_q8EaFZjIil69muiVYokwHY_VLH3ZIRDrvM';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function setupDatabase() {
  console.log('Setting up BETRA database...\n');

  // Create profiles table
  const { error: profilesError } = await supabase.rpc('exec_sql', {
    sql: `
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
    `
  });
  
  if (profilesError) {
    console.log('Profiles table (may already exist):', profilesError.message);
  } else {
    console.log('✅ Profiles table created');
  }

  // Create bets table
  const { error: betsError } = await supabase.rpc('exec_sql', {
    sql: `
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
    `
  });
  
  if (betsError) {
    console.log('Bets table (may already exist):', betsError.message);
  } else {
    console.log('✅ Bets table created');
  }

  // Create follows table
  const { error: followsError } = await supabase.rpc('exec_sql', {
    sql: `
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
    `
  });
  
  if (followsError) {
    console.log('Follows table (may already exist):', followsError.message);
  } else {
    console.log('✅ Follows table created');
  }

  // Create leaderboard view
  const { error: viewError } = await supabase.rpc('exec_sql', {
    sql: `
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
    `
  });
  
  if (viewError) {
    console.log('Leaderboard view (may already exist):', viewError.message);
  } else {
    console.log('✅ Leaderboard view created');
  }

  // Enable realtime
  const { error: realtimeError } = await supabase.rpc('exec_sql', {
    sql: `
      drop publication if exists supabase_realtime;
      create publication supabase_realtime;
      alter publication supabase_realtime add table public.bets;
    `
  });
  
  if (realtimeError) {
    console.log('Realtime (may already be configured):', realtimeError.message);
  } else {
    console.log('✅ Realtime enabled');
  }

  console.log('\n🎉 Database setup complete!');
  console.log('Project URL:', SUPABASE_URL);
}

setupDatabase().catch(console.error);
