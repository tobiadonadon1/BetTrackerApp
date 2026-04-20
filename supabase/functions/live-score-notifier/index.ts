// Supabase Edge Function: live-score-notifier
// Polls API-Football for live scores and sends push notifications via Expo Push API.
// Deploy:   supabase functions deploy live-score-notifier
// Schedule: pg_cron via migration 013_cron_live_score_notifier.sql (every 60s)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY') || 'ec2c3bd7c9e43099790986337b5dac11';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface LiveFixture {
  fixture: { id: number; status: { short: string; elapsed: number | null } };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
}

interface CacheRow {
  fixture_id: number;
  home_score: number;
  away_score: number;
  status: string;
  notified_end: boolean;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  priority: 'high';
  channelId: 'default';
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

function parseTeams(event: string): { home: string; away: string } | null {
  const stripped = event.replace(/^[^—]*—\s*/, '');
  const m = stripped.match(/^(.+?)\s+(?:vs|v\.?s\.?|-)\s+(.+)$/i);
  return m ? { home: m[1].trim(), away: m[2].trim() } : null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function teamMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function sendExpoBatch(batch: ExpoMessage[]): Promise<ExpoTicket[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(batch),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[live-score-notifier] Expo push failed', res.status, JSON.stringify(json).substring(0, 500));
    return batch.map(() => ({ status: 'error', message: `HTTP ${res.status}` }));
  }
  return Array.isArray(json?.data) ? json.data : [];
}

async function clearInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const { error } = await supabase
    .from('profiles')
    .update({ push_token: null })
    .in('push_token', tokens);
  if (error) console.error('[live-score-notifier] Failed to clear invalid tokens:', error.message);
  else console.log(`[live-score-notifier] Cleared ${tokens.length} invalid push token(s)`);
}

Deno.serve(async (_req) => {
  const startedAt = Date.now();
  try {
    // 1. Pending bets
    const { data: bets, error: betsError } = await supabase
      .from('bets')
      .select('id, user_id, selections, title')
      .eq('status', 'pending');
    if (betsError) throw betsError;
    if (!bets || bets.length === 0) {
      return new Response(JSON.stringify({ status: 'no_pending_bets' }), { status: 200 });
    }

    // 2. Push tokens
    const userIds = [...new Set(bets.map((b) => b.user_id))];
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, push_token')
      .in('id', userIds)
      .not('push_token', 'is', null);
    if (profilesError) throw profilesError;

    const tokenMap = new Map<string, string>();
    for (const p of profiles || []) {
      if (p.push_token) tokenMap.set(p.id, p.push_token);
    }
    if (tokenMap.size === 0) {
      return new Response(JSON.stringify({ status: 'no_push_tokens', bets: bets.length }), { status: 200 });
    }

    // 3. Live fixtures
    const liveRes = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
    });
    if (!liveRes.ok) {
      const detail = await liveRes.text().catch(() => '');
      console.error('[live-score-notifier] API-Football error', liveRes.status, detail.substring(0, 300));
      return new Response(JSON.stringify({ error: 'api_football_failed', status: liveRes.status }), { status: 502 });
    }
    const liveJson = await liveRes.json();
    const fixtures: LiveFixture[] = Array.isArray(liveJson?.response) ? liveJson.response : [];

    // 4. Cache (previous state)
    const fixtureIds = fixtures.map((f) => f.fixture.id);
    const prevMap = new Map<number, CacheRow>();
    if (fixtureIds.length > 0) {
      const { data: prevRows, error: cacheError } = await supabase
        .from('live_score_cache')
        .select('fixture_id, home_score, away_score, status, notified_end')
        .in('fixture_id', fixtureIds);
      if (cacheError) throw cacheError;
      for (const r of prevRows || []) prevMap.set(r.fixture_id, r as CacheRow);
    }

    // 5. Build notifications + cache updates
    const notifications: ExpoMessage[] = [];
    const cacheUpdates = new Map<number, CacheRow>();
    // Dedup within invocation so a user with multiple selections on same fixture gets ONE push per event
    const goalDedup = new Set<string>();
    const endDedup = new Set<string>();

    for (const bet of bets) {
      const token = tokenMap.get(bet.user_id);
      if (!token) continue;

      const selections = Array.isArray(bet.selections) ? bet.selections : [];
      for (const sel of selections) {
        if (!sel || sel.status !== 'pending' || !sel.event) continue;
        const teams = parseTeams(sel.event);
        if (!teams) continue;

        for (const fx of fixtures) {
          if (!teamMatch(teams.home, fx.teams.home.name) || !teamMatch(teams.away, fx.teams.away.name)) continue;

          const fixtureId = fx.fixture.id;
          const homeScore = fx.goals.home ?? 0;
          const awayScore = fx.goals.away ?? 0;
          const isFinished = FINISHED_STATUSES.has(fx.fixture.status.short);
          const newStatus = isFinished ? 'finished' : 'live';
          const prev = prevMap.get(fixtureId);

          // Goal: score differs from previously cached score
          if (prev && (prev.home_score !== homeScore || prev.away_score !== awayScore)) {
            const key = `${token}|${fixtureId}|${homeScore}-${awayScore}`;
            if (!goalDedup.has(key)) {
              goalDedup.add(key);
              notifications.push({
                to: token,
                title: `⚽ GOL! ${fx.teams.home.name} ${homeScore} - ${awayScore} ${fx.teams.away.name}`,
                body: `Punteggio aggiornato — ${fx.fixture.status.elapsed ?? '?'}' giocati`,
                data: { type: 'goal', betId: bet.id, fixtureId },
                sound: 'default',
                priority: 'high',
                channelId: 'default',
              });
            }
          }

          // Match end: only fire if we've never notified the end for this fixture
          if (isFinished && !(prev?.notified_end)) {
            const key = `${token}|${fixtureId}`;
            if (!endDedup.has(key)) {
              endDedup.add(key);
              notifications.push({
                to: token,
                title: `🏁 Partita Finita: ${fx.teams.home.name} ${homeScore} - ${awayScore} ${fx.teams.away.name}`,
                body: `Risultato finale per la tua scommessa`,
                data: { type: 'match_end', betId: bet.id, fixtureId },
                sound: 'default',
                priority: 'high',
                channelId: 'default',
              });
            }
          }

          cacheUpdates.set(fixtureId, {
            fixture_id: fixtureId,
            home_score: homeScore,
            away_score: awayScore,
            status: newStatus,
            notified_end: isFinished ? true : (prev?.notified_end ?? false),
          });
          break;
        }
      }
    }

    // 6. Send pushes in batches, collect tickets
    const invalidTokens = new Set<string>();
    let sent = 0;
    if (notifications.length > 0) {
      for (let i = 0; i < notifications.length; i += EXPO_BATCH_SIZE) {
        const batch = notifications.slice(i, i + EXPO_BATCH_SIZE);
        const tickets = await sendExpoBatch(batch);
        for (let j = 0; j < tickets.length; j++) {
          const t = tickets[j];
          const msg = batch[j];
          if (t?.status === 'ok') {
            sent++;
          } else {
            const err = t?.details?.error;
            console.error('[live-score-notifier] push error', err || t?.message, 'for token', msg.to.substring(0, 20) + '…');
            if (err === 'DeviceNotRegistered' || err === 'InvalidCredentials') {
              invalidTokens.add(msg.to);
            }
          }
        }
      }
    }

    // 7. Persist cache
    if (cacheUpdates.size > 0) {
      const rows = [...cacheUpdates.values()];
      const { error: upsertError } = await supabase
        .from('live_score_cache')
        .upsert(rows, { onConflict: 'fixture_id' });
      if (upsertError) console.error('[live-score-notifier] cache upsert failed:', upsertError.message);
    }

    // 8. Clean up dead tokens so we stop hammering Expo with them
    if (invalidTokens.size > 0) {
      await clearInvalidTokens([...invalidTokens]);
    }

    const body = {
      status: 'ok',
      fixtures_live: fixtures.length,
      bets_checked: bets.length,
      notifications_queued: notifications.length,
      notifications_sent: sent,
      tokens_invalidated: invalidTokens.size,
      elapsed_ms: Date.now() - startedAt,
    };
    console.log('[live-score-notifier]', JSON.stringify(body));
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    const e = err as { message?: string; code?: string; details?: string; hint?: string };
    const detail = {
      message: e?.message || String(err),
      code: e?.code,
      details: e?.details,
      hint: e?.hint,
    };
    console.error('[live-score-notifier] fatal error:', JSON.stringify(detail));
    return new Response(JSON.stringify({ error: detail }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
