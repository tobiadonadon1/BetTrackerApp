-- Subscriptions table — stores each user's plan + trial info
-- New users get a 7-day Pro trial via the auto-create trigger below.

create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null unique,
  tier text not null default 'pro' check (tier in ('free', 'pro', 'elite')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz default now(),
  current_period_end timestamptz,
  status text not null default 'trialing' check (status in ('active', 'canceled', 'past_due', 'trialing')),
  trial_ends_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Enable RLS
alter table public.subscriptions enable row level security;

-- Users can read their own subscription
create policy "Users can view their own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Users can insert their own subscription (for auto-create trigger fallback)
create policy "Users can insert their own subscription"
  on public.subscriptions for insert
  with check (auth.uid() = user_id);

-- Only service role (Edge Functions) should update subscriptions
-- But we also allow users to read their own row via select policy above
create policy "Service role can manage subscriptions"
  on public.subscriptions for all
  using (auth.role() = 'service_role');

-- Auto-create a subscription row when a new user signs up
create or replace function public.handle_new_user_subscription()
returns trigger as $$
begin
  insert into public.subscriptions (user_id, tier, status, trial_ends_at)
  values (new.id, 'pro', 'trialing', now() + interval '7 days')
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger: fire after a new profile is created
create trigger on_profile_created_subscription
  after insert on public.profiles
  for each row execute function public.handle_new_user_subscription();

-- Trigger for updated_at
create trigger on_subscription_updated
  before update on public.subscriptions
  for each row execute function public.handle_updated_at();

-- Add to realtime publication
alter publication supabase_realtime add table public.subscriptions;
