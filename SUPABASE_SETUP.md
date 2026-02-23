# Supabase Setup Guide for BETRA

## 1. Create Supabase Project

1. Go to https://supabase.com and sign up/login
2. Click "New Project"
3. Name it "betra" or your preferred name
4. Choose a region close to your users
5. Wait for the project to be created

## 2. Get Your Credentials

Once your project is ready:

1. Go to Project Settings (gear icon)
2. Click "API" in the sidebar
3. Copy these values:
   - **Project URL** (e.g., `https://abcdefgh12345678.supabase.co`)
   - **anon public** API key (starts with `eyJ...`)

## 3. Configure Environment Variables

Create a `.env` file in your project root:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Or hardcode them in `src/config/supabase.ts` (not recommended for production):

```typescript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

## 4. Run the Database Migrations

1. In Supabase Dashboard, go to "SQL Editor" (left sidebar)
2. Click "New query"
3. Copy and paste the entire contents of `supabase/migrations/001_initial_schema.sql`
4. Click "Run"
5. Run `supabase/migrations/003_leaderboard_all_time.sql` the same way (for the "All Time" leaderboard filter)

This creates:
- `profiles` table (user profiles)
- `bets` table (bet tracking)
- `follows` table (community following)
- Row Level Security policies
- Realtime subscriptions
- Leaderboard view (30-day)
- Leaderboard all-time view (for "All Time" filter)

## 5. Enable Authentication

1. Go to "Authentication" → "Providers" in Supabase dashboard
2. Make sure "Email" provider is enabled
3. (Optional) Configure "Confirm email" settings as needed

## 6. Test the Integration

1. Start your app: `npx expo start`
2. Try signing up with a new account
3. Add a bet
4. Check that data persists (reload app, data should remain)

## Features Now Enabled

✅ **Real Authentication** - Email/password signup/login  
✅ **Cloud Database** - All bets stored in Supabase  
✅ **Real-time Sync** - Bets update instantly across devices  
✅ **Row Level Security** - Users can only access their own data  
✅ **Community Leaderboard** - Public stats with follow/unfollow  
✅ **Cross-device Access** - Login on any device, see your bets  

## Troubleshooting

**"Failed to load bets" / "Not authenticated"**
- Check your Supabase URL and anon key are correct
- Ensure the SQL migrations ran successfully

**Auth not working**
- Verify Email provider is enabled in Supabase Auth settings
- Check browser console for detailed error messages

**Realtime not working**
- Ensure realtime is enabled in Supabase: Database → Replication → Realtime (toggle on)
- Check that the `bets` table is in the realtime publication

## Production Checklist

- [ ] Use environment variables for credentials (don't hardcode)
- [ ] Enable Row Level Security (already done in migrations)
- [ ] Set up email templates in Supabase Auth settings
- [ ] Configure rate limiting in Supabase
- [ ] Enable database backups in Supabase
- [ ] Set up monitoring/alerts in Supabase dashboard
