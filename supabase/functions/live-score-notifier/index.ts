// Supabase Edge Function: live-score-notifier
// Polls API-Football (for soccer) and the live_scores table (populated by fetch-live-scores
// for NBA/NFL/MLB/NHL/EPL/LaLiga/MMA) and sends push notifications via Expo Push API.
//
// Event types supported:
//   • goal         — including Penalty / Own Goal / Missed Penalty / Assist details
//   • red_card     — straight red + second yellow
//   • ou_cross     — Over/Under threshold crossed for goals-based bets
//   • match_end    — final whistle for a tracked fixture
//   • bet_settled  — single bet resolved won/lost via resolvePickFromScore
//   • parlay_leg_lost — a parlay leg just lost (parlay now broken)
//   • parlay_won   — every leg of a parlay has won
//
// Dedup is per (bet_id, event_key) via bet_notification_log with ON CONFLICT DO NOTHING —
// if the insert lands we send the push, if it conflicts we skip silently.
//
// Deploy:   supabase functions deploy live-score-notifier
// Schedule: pg_cron every 60s — see 013_cron_live_score_notifier.sql

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Config ─────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY') || 'ec2c3bd7c9e43099790986337b5dac11';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_BATCH_SIZE = 100;
// Expo receipts become available ~15 min after send. We poll tickets aged
// between 3 min and 24 h; older rows are stamped receipt_checked_at so the
// partial index stays small.
const RECEIPT_POLL_MIN_AGE_MS = 3 * 60 * 1000;
const RECEIPT_POLL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECEIPT_POLL_BATCH = 1000;
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Types ──────────────────────────────────────────────────────────

interface BetSelection {
  event?: string;
  pick?: string;
  selection?: string;
  status?: 'pending' | 'won' | 'lost' | 'void';
  odds?: number;
  category?: string;
}

interface Bet {
  id: string;
  user_id: string;
  title: string;
  stake: number;
  potential_win: number;
  total_odds: number;
  status: 'pending' | 'won' | 'lost' | 'void';
  category: string;
  bet_type: string;
  selections: BetSelection[] | null;
}

interface LiveFixture {
  fixture: { id: number; status: { short: string; elapsed: number | null } };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
}

interface FixtureEvent {
  time: { elapsed: number | null; extra: number | null };
  team: { id: number; name: string };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  type: string;
  detail: string;
  comments: string | null;
}

interface LiveScoreRow {
  event_id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  completed: boolean;
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

interface Candidate {
  betId: string;
  userId: string;
  token: string;
  eventKey: string;
  eventType: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

// ─── Team / text helpers ────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function teamMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

function parseTeams(event: string): { home: string; away: string } | null {
  const stripped = event.replace(/^[^—]*—\s*/, '');
  const m = stripped.match(/^(.+?)\s+(?:vs|v\.?s\.?|-)\s+(.+)$/i);
  return m ? { home: m[1].trim(), away: m[2].trim() } : null;
}

function selectionText(sel: BetSelection): string {
  return (sel.pick || sel.selection || '').toString();
}

// ─── Bet-resolution logic (ported from src/services/matchResultsService.ts) ─

function resolvePickFromScore(
  selectionStr: string,
  homeScore: number,
  awayScore: number,
  homeTeam?: string,
  awayTeam?: string,
): 'won' | 'lost' | null {
  const sel = selectionStr.toLowerCase().trim();
  const total = homeScore + awayScore;

  if (/1x2|esito.*finale|match\s*result/i.test(sel)) {
    if (/:\s*1\b|home\s*win/i.test(sel)) return homeScore > awayScore ? 'won' : 'lost';
    if (/:\s*2\b|away\s*win/i.test(sel)) return awayScore > homeScore ? 'won' : 'lost';
    if (/:\s*x\b|draw|pareggio/i.test(sel)) return homeScore === awayScore ? 'won' : 'lost';
    if (/\b1\b\s*$/i.test(sel) || /pick.*\b1\b/i.test(sel)) return homeScore > awayScore ? 'won' : 'lost';
    if (/\b2\b\s*$/i.test(sel)) return awayScore > homeScore ? 'won' : 'lost';
  }

  if (/^1$/.test(sel)) return homeScore > awayScore ? 'won' : 'lost';
  if (/^2$/.test(sel)) return awayScore > homeScore ? 'won' : 'lost';
  if (/^x$/.test(sel)) return homeScore === awayScore ? 'won' : 'lost';

  if (/^1x$|^1-x$|casa o pareggio/i.test(sel)) return homeScore >= awayScore ? 'won' : 'lost';
  if (/^x2$|^x-2$|ospite o pareggio/i.test(sel)) return awayScore >= homeScore ? 'won' : 'lost';
  if (/^12$|^1-2$/i.test(sel)) return homeScore !== awayScore ? 'won' : 'lost';

  const exactScoreMatch = sel.match(/^(?:risultato\s*esatto\s*)?(\d+)\s*[-:]\s*(\d+)$/i);
  if (exactScoreMatch) {
    const p1 = parseInt(exactScoreMatch[1]);
    const p2 = parseInt(exactScoreMatch[2]);
    return (homeScore === p1 && awayScore === p2) ? 'won' : 'lost';
  }

  const bothScored = homeScore > 0 && awayScore > 0;
  if (/btts|goal.*no.*goal|entrambe/i.test(sel)) {
    if (/:\s*(?:goal|yes|si|sì)\b/i.test(sel)) return bothScored ? 'won' : 'lost';
    if (/:\s*(?:no\s*goal|no)\b/i.test(sel)) return !bothScored ? 'won' : 'lost';
    if (/^btts$/i.test(sel)) return bothScored ? 'won' : 'lost';
  }
  if (/^gol$|^gg$|^entrambe segnano( sì)?$/i.test(sel)) return bothScored ? 'won' : 'lost';
  if (/^no gol$|^ng$|^entrambe segnano no$/i.test(sel)) return !bothScored ? 'won' : 'lost';

  const multiGolMatch = sel.match(/multi\s*gol\s*(\d+)\s*[-_]\s*(\d+)/i);
  if (multiGolMatch) {
    const min = parseInt(multiGolMatch[1]);
    const max = parseInt(multiGolMatch[2]);
    return (total >= min && total <= max) ? 'won' : 'lost';
  }

  const ouMatch = sel.match(/(?:over|under|o|u|pi[uù]\s*di|meno\s*di)\s*(\d+(?:[.,]\d+)?)/i);
  if (ouMatch) {
    const line = parseFloat(ouMatch[1].replace(',', '.'));
    if (/over|^o\s*\d|pi[uù]\s*di/i.test(sel)) return total > line ? 'won' : 'lost';
    if (/under|^u\s*\d|meno\s*di/i.test(sel)) return total < line ? 'won' : 'lost';
  }

  const standaloneNum = sel.match(/^0?(\d+(?:[.,]\d+)?)$/);
  if (standaloneNum) {
    const line = parseFloat(standaloneNum[1].replace(',', '.'));
    if (line > 0 && line < 20) return total > line ? 'won' : 'lost';
  }

  if (/^pari$/i.test(sel)) return (total % 2 === 0) ? 'won' : 'lost';
  if (/^dispari$/i.test(sel)) return (total % 2 !== 0) ? 'won' : 'lost';

  if (homeTeam && awayTeam) {
    const selNorm = sel.replace(/[^a-z0-9\s]/g, '').trim();
    const homeNorm = homeTeam.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const awayNorm = awayTeam.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (selNorm && (selNorm.includes(homeNorm) || homeNorm.includes(selNorm))) {
      return homeScore > awayScore ? 'won' : homeScore < awayScore ? 'lost' : null;
    }
    if (selNorm && (selNorm.includes(awayNorm) || awayNorm.includes(selNorm))) {
      return awayScore > homeScore ? 'won' : awayScore < homeScore ? 'lost' : null;
    }
  }

  return null;
}

// ─── Over/Under parser (ported from src/utils/overUnderParser.ts, goals-only) ─

type OUDir = 'over' | 'under';
interface OUInfo { direction: OUDir; threshold: number; goalsBased: boolean; }

function parseOverUnderGoals(selectionText: string): OUInfo | null {
  if (!selectionText) return null;
  const text = selectionText.trim();
  const detailed = /(corner|cartellin|card|ammonizion|shots?\s*on\s*target|tiri?\s*in\s*porta|total\s*shots|tiri?\s*total|foul|falli|rebound|assist|passing\s*yard|rushing\s*yard)/i;
  const isGoalsContext = !detailed.test(text);

  const en = text.match(/\b(over|under)\s+(\d+(?:[.,]\d+)?)\b/i);
  if (en) {
    const direction: OUDir = en[1].toLowerCase() === 'over' ? 'over' : 'under';
    return { direction, threshold: parseFloat(en[2].replace(',', '.')), goalsBased: isGoalsContext };
  }
  const it = text.match(/\b(pi[uù]\s*di|meno\s*di)\s+(\d+(?:[.,]\d+)?)\b/i);
  if (it) {
    const direction: OUDir = it[1].toLowerCase().startsWith('pi') ? 'over' : 'under';
    return { direction, threshold: parseFloat(it[2].replace(',', '.')), goalsBased: isGoalsContext };
  }
  const short = text.match(/^([OU])\s*(\d+(?:[.,]\d+)?)\b/i);
  if (short) {
    const direction: OUDir = short[1].toUpperCase() === 'O' ? 'over' : 'under';
    return { direction, threshold: parseFloat(short[2].replace(',', '.')), goalsBased: isGoalsContext };
  }
  return null;
}

// ─── Expo push helpers ──────────────────────────────────────────────

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

// ─── Expo receipt polling ───────────────────────────────────────────
//
// Poll Expo for receipts of tickets we sent on previous cron runs. Updates
// bet_notification_log with the terminal status (ok / error + details) and
// invalidates push tokens for DeviceNotRegistered. Runs at the top of every
// cron tick so slow-to-arrive receipts still get observed.

interface ReceiptResult {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

async function pollReceipts(): Promise<{ checked: number; failed: number; tokensInvalidated: number }> {
  const now = Date.now();
  const minOldest = new Date(now - RECEIPT_POLL_MAX_AGE_MS).toISOString();
  const maxNewest = new Date(now - RECEIPT_POLL_MIN_AGE_MS).toISOString();

  const { data: rows, error } = await supabase
    .from('bet_notification_log')
    .select('id, ticket_id, user_id')
    .is('receipt_checked_at', null)
    .not('ticket_id', 'is', null)
    .gte('notified_at', minOldest)
    .lte('notified_at', maxNewest)
    .order('notified_at', { ascending: true })
    .limit(RECEIPT_POLL_BATCH);

  if (error) {
    console.error('[live-score-notifier] receipt scan failed:', error.message);
    return { checked: 0, failed: 0, tokensInvalidated: 0 };
  }
  if (!rows || rows.length === 0) return { checked: 0, failed: 0, tokensInvalidated: 0 };

  type LogRow = { id: number; ticket_id: string; user_id: string };
  const typedRows = rows as LogRow[];

  // Hydrate push tokens for DeviceNotRegistered invalidation.
  const userIds = [...new Set(typedRows.map((r) => r.user_id))];
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, push_token')
    .in('id', userIds);
  const tokenByUser = new Map<string, string>();
  for (const p of profs || []) if (p.push_token) tokenByUser.set(p.id, p.push_token);

  let checked = 0;
  let failed = 0;
  const deadTokens = new Set<string>();

  for (let i = 0; i < typedRows.length; i += 100) {
    const chunk = typedRows.slice(i, i + 100);
    const ids = chunk.map((r) => r.ticket_id);
    let receipts: Record<string, ReceiptResult> = {};
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        console.error('[live-score-notifier] getReceipts failed', res.status);
        continue;
      }
      const json = await res.json();
      receipts = json?.data || {};
    } catch (e) {
      console.error('[live-score-notifier] getReceipts threw:', (e as Error).message);
      continue;
    }

    const updates: { id: number; status: string; error: string | null }[] = [];
    for (const row of chunk) {
      const r = receipts[row.ticket_id];
      if (!r) continue; // still pending, leave receipt_checked_at null
      checked++;
      if (r.status === 'error') {
        failed++;
        const errCode = r.details?.error || r.message || 'Unknown';
        updates.push({ id: row.id, status: 'error', error: errCode });
        if (errCode === 'DeviceNotRegistered') {
          const t = tokenByUser.get(row.user_id);
          if (t) deadTokens.add(t);
        }
      } else {
        updates.push({ id: row.id, status: 'ok', error: null });
      }
    }

    // Bulk-update in a single round-trip per batch by issuing parallel updates.
    await Promise.all(
      updates.map((u) =>
        supabase
          .from('bet_notification_log')
          .update({
            receipt_status: u.status,
            receipt_error: u.error,
            receipt_checked_at: new Date().toISOString(),
          })
          .eq('id', u.id),
      ),
    );
  }

  if (deadTokens.size > 0) await clearInvalidTokens([...deadTokens]);
  return { checked, failed, tokensInvalidated: deadTokens.size };
}

// ─── Candidate builder ──────────────────────────────────────────────

function goalTitle(detail: string, home: string, hs: number, as: number, away: string): string {
  const d = detail.toLowerCase();
  if (d.includes('own')) return `😵 AUTOGOL! ${home} ${hs} - ${as} ${away}`;
  if (d.includes('penalty') && !d.includes('missed')) return `🎯 RIGORE! ${home} ${hs} - ${as} ${away}`;
  return `⚽ GOL! ${home} ${hs} - ${as} ${away}`;
}

function cardTitle(detail: string, player: string | null, team: string): string {
  if (/second\s*yellow/i.test(detail)) return `🟨🟥 Doppio giallo: ${player || 'giocatore'} (${team})`;
  return `🟥 CARTELLINO ROSSO: ${player || 'giocatore'} (${team})`;
}

function formatMoney(n: number): string {
  return `€${n.toFixed(2)}`;
}

// Check if selection applies to a particular fixture (by team names).
function selectionMatchesFixture(sel: BetSelection, fixtureHome: string, fixtureAway: string): boolean {
  if (!sel.event) return false;
  const teams = parseTeams(sel.event);
  if (!teams) return false;
  return teamMatch(teams.home, fixtureHome) && teamMatch(teams.away, fixtureAway);
}

// ─── Main handler ───────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();
  try {
    // ── 0. Poll receipts for previously sent pushes ────────────────
    //
    // Runs first so slow-to-arrive receipts get observed even on ticks with
    // no new live events. The poller catches its own errors internally.
    const receiptsSummary = await pollReceipts();

    // ── 1. Pending bets + push tokens ──────────────────────────────

    const { data: bets, error: betsError } = await supabase
      .from('bets')
      .select('id, user_id, title, stake, potential_win, total_odds, status, category, bet_type, selections')
      .eq('status', 'pending');
    if (betsError) throw betsError;
    if (!bets || bets.length === 0) {
      return new Response(
        JSON.stringify({ status: 'no_pending_bets', receipts: receiptsSummary }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const userIds = [...new Set(bets.map((b: { user_id: string }) => b.user_id))];
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, push_token')
      .in('id', userIds)
      .not('push_token', 'is', null);
    if (profilesError) throw profilesError;

    const tokenMap = new Map<string, string>();
    for (const p of profiles || []) if (p.push_token) tokenMap.set(p.id, p.push_token);
    if (tokenMap.size === 0) {
      return new Response(
        JSON.stringify({ status: 'no_push_tokens', bets: bets.length, receipts: receiptsSummary }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Live football fixtures ──────────────────────────────────

    let fixtures: LiveFixture[] = [];
    try {
      const liveRes = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
        headers: { 'x-apisports-key': API_FOOTBALL_KEY },
      });
      if (liveRes.ok) {
        const liveJson = await liveRes.json();
        fixtures = Array.isArray(liveJson?.response) ? liveJson.response : [];
      } else {
        const detail = await liveRes.text().catch(() => '');
        console.error('[live-score-notifier] API-Football error', liveRes.status, detail.substring(0, 300));
      }
    } catch (err) {
      console.error('[live-score-notifier] API-Football fetch failed:', (err as Error).message);
    }

    // ── 3. Previous cache state ────────────────────────────────────

    const fixtureIds = fixtures.map((f) => f.fixture.id);
    const prevCache = new Map<number, CacheRow>();
    if (fixtureIds.length > 0) {
      const { data: prevRows, error: cacheError } = await supabase
        .from('live_score_cache')
        .select('fixture_id, home_score, away_score, status, notified_end')
        .in('fixture_id', fixtureIds);
      if (cacheError) throw cacheError;
      for (const r of prevRows || []) prevCache.set(r.fixture_id, r as CacheRow);
    }

    // ── 4. Figure out which fixtures are relevant + map bets to fixtures ─

    const fixtureById = new Map<number, LiveFixture>();
    for (const f of fixtures) fixtureById.set(f.fixture.id, f);

    // bet → fixture mappings (one bet may touch multiple fixtures if parlay)
    interface BetFixtureLink { bet: Bet; selectionIdx: number; fixture: LiveFixture; }
    const betFixtureLinks: BetFixtureLink[] = [];
    const relevantFixtureIds = new Set<number>();

    for (const bet of bets as unknown as Bet[]) {
      const sels = Array.isArray(bet.selections) ? bet.selections : [];
      for (let i = 0; i < sels.length; i++) {
        const sel = sels[i];
        if (!sel || sel.status !== 'pending' || !sel.event) continue;
        for (const fx of fixtures) {
          if (selectionMatchesFixture(sel, fx.teams.home.name, fx.teams.away.name)) {
            betFixtureLinks.push({ bet, selectionIdx: i, fixture: fx });
            relevantFixtureIds.add(fx.fixture.id);
            break;
          }
        }
      }
    }

    // ── 5. Pull fixture events for relevant fixtures (only where score moved or finished) ──
    //
    // Motivation: /fixtures/events is a separate API-Football call per fixture. To stay
    // under quota we only fetch events for fixtures whose score changed since last run,
    // or that just transitioned to finished (so we can caption the final goal correctly),
    // or for which we've never cached state before.

    const eventsByFixture = new Map<number, FixtureEvent[]>();
    const fixturesToFetchEvents: number[] = [];
    for (const fid of relevantFixtureIds) {
      const fx = fixtureById.get(fid)!;
      const prev = prevCache.get(fid);
      const scoreChanged = !prev
        || prev.home_score !== (fx.goals.home ?? 0)
        || prev.away_score !== (fx.goals.away ?? 0);
      const justFinished = FINISHED_STATUSES.has(fx.fixture.status.short) && !(prev?.notified_end);
      if (scoreChanged || justFinished) fixturesToFetchEvents.push(fid);
    }

    const eventsResults = await Promise.all(
      fixturesToFetchEvents.map(async (fid) => {
        try {
          const res = await fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${fid}`, {
            headers: { 'x-apisports-key': API_FOOTBALL_KEY },
          });
          if (!res.ok) return { fid, events: [] as FixtureEvent[] };
          const json = await res.json();
          return { fid, events: (Array.isArray(json?.response) ? json.response : []) as FixtureEvent[] };
        } catch {
          return { fid, events: [] as FixtureEvent[] };
        }
      }),
    );
    for (const { fid, events } of eventsResults) eventsByFixture.set(fid, events);

    // ── 6. Build notification candidates ───────────────────────────

    const candidates: Candidate[] = [];
    const cacheUpdates = new Map<number, CacheRow>();

    // Bets that need their status evaluated at match end (accumulated here).
    const betsToSettle = new Set<string>();

    for (const link of betFixtureLinks) {
      const { bet, selectionIdx, fixture } = link;
      const sel = (bet.selections || [])[selectionIdx];
      if (!sel) continue;
      const token = tokenMap.get(bet.user_id);
      if (!token) continue;

      const fx = fixture;
      const fixtureId = fx.fixture.id;
      const home = fx.teams.home.name;
      const away = fx.teams.away.name;
      const homeScore = fx.goals.home ?? 0;
      const awayScore = fx.goals.away ?? 0;
      const isFinished = FINISHED_STATUSES.has(fx.fixture.status.short);
      const newStatus = isFinished ? 'finished' : 'live';
      const prev = prevCache.get(fixtureId);
      const events = eventsByFixture.get(fixtureId) || [];

      const elapsed = fx.fixture.status.elapsed;
      const matchLabel = `${home} vs ${away}`;

      // (a) Goal + detail + assist (from events, with fallback to generic goal on score change)
      if (prev && (prev.home_score !== homeScore || prev.away_score !== awayScore)) {
        // Find goal events in the tail of the event list that aren't already logged
        const goalEvents = events.filter((e) => e.type === 'Goal');
        if (goalEvents.length > 0) {
          for (const ge of goalEvents) {
            const min = ge.time.elapsed ?? 0;
            const extra = ge.time.extra ?? 0;
            const keyMin = extra ? `${min}+${extra}` : `${min}`;
            const player = ge.player?.name || 'Sconosciuto';
            const detail = ge.detail || 'Normal Goal';
            const teamName = ge.team?.name || '';
            const eventKey = `fx${fixtureId}:goal:${keyMin}:${normalize(player)}:${normalize(detail)}`;

            if (/missed\s*penalty/i.test(detail)) {
              candidates.push({
                betId: bet.id,
                userId: bet.user_id,
                token,
                eventKey,
                eventType: 'missed_penalty',
                title: `❌ Rigore sbagliato`,
                body: `${player} (${teamName}) — ${matchLabel}, ${keyMin}'`,
                data: { type: 'missed_penalty', betId: bet.id, fixtureId, player },
              });
              continue;
            }

            candidates.push({
              betId: bet.id,
              userId: bet.user_id,
              token,
              eventKey,
              eventType: 'goal',
              title: goalTitle(detail, home, homeScore, awayScore, away),
              body: `${player}${ge.assist?.name ? ` (assist: ${ge.assist.name})` : ''} — ${keyMin}' ${teamName}`,
              data: {
                type: 'goal',
                detail,
                betId: bet.id,
                fixtureId,
                player,
                assist: ge.assist?.name || null,
              },
            });

            // Separate assist notification only if bettor's selection mentions assists
            if (ge.assist?.name && /assist/i.test(selectionText(sel))) {
              const assistKey = `fx${fixtureId}:assist:${keyMin}:${normalize(ge.assist.name)}`;
              candidates.push({
                betId: bet.id,
                userId: bet.user_id,
                token,
                eventKey: assistKey,
                eventType: 'assist',
                title: `🅰️ Assist: ${ge.assist.name}`,
                body: `${matchLabel} — ${keyMin}'`,
                data: { type: 'assist', betId: bet.id, fixtureId, assist: ge.assist.name },
              });
            }
          }
        } else {
          // Fallback: no event list but score moved — generic goal push
          const eventKey = `fx${fixtureId}:goal_fallback:${homeScore}-${awayScore}`;
          candidates.push({
            betId: bet.id,
            userId: bet.user_id,
            token,
            eventKey,
            eventType: 'goal',
            title: `⚽ GOL! ${home} ${homeScore} - ${awayScore} ${away}`,
            body: `Punteggio aggiornato — ${elapsed ?? '?'}' giocati`,
            data: { type: 'goal', betId: bet.id, fixtureId },
          });
        }

        // (b) Over/Under goals-based threshold crossings — only for this bet's O/U selection
        const ou = parseOverUnderGoals(selectionText(sel));
        if (ou && ou.goalsBased) {
          const prevTotal = (prev.home_score) + (prev.away_score);
          const newTotal = homeScore + awayScore;
          if (ou.direction === 'over' && prevTotal <= ou.threshold && newTotal > ou.threshold) {
            candidates.push({
              betId: bet.id,
              userId: bet.user_id,
              token,
              eventKey: `bet${bet.id}:ou_over_cross:fx${fixtureId}:${ou.threshold}`,
              eventType: 'ou_cross',
              title: `🎯 La tua Over ${ou.threshold} è passata!`,
              body: `${matchLabel} ${homeScore}-${awayScore} — selezione in VINCITA`,
              data: { type: 'ou_cross', betId: bet.id, direction: 'over', threshold: ou.threshold },
            });
          } else if (ou.direction === 'under' && prevTotal < ou.threshold && newTotal >= ou.threshold) {
            candidates.push({
              betId: bet.id,
              userId: bet.user_id,
              token,
              eventKey: `bet${bet.id}:ou_under_break:fx${fixtureId}:${ou.threshold}`,
              eventType: 'ou_cross',
              title: `⚠️ La tua Under ${ou.threshold} è sforata`,
              body: `${matchLabel} ${homeScore}-${awayScore} — selezione in PERDITA`,
              data: { type: 'ou_cross', betId: bet.id, direction: 'under', threshold: ou.threshold },
            });
          }
        }
      }

      // (c) Red card notifications (from events — independent of score changes)
      for (const e of events) {
        if (e.type !== 'Card') continue;
        const isRed = /red/i.test(e.detail) || /second\s*yellow/i.test(e.detail);
        if (!isRed) continue;
        const min = e.time.elapsed ?? 0;
        const extra = e.time.extra ?? 0;
        const keyMin = extra ? `${min}+${extra}` : `${min}`;
        const player = e.player?.name || 'sconosciuto';
        const eventKey = `fx${fixtureId}:redcard:${keyMin}:${normalize(player)}:${normalize(e.detail)}`;
        candidates.push({
          betId: bet.id,
          userId: bet.user_id,
          token,
          eventKey,
          eventType: 'red_card',
          title: cardTitle(e.detail, e.player?.name || null, e.team?.name || ''),
          body: `${matchLabel} — ${keyMin}'`,
          data: { type: 'red_card', betId: bet.id, fixtureId, player: e.player?.name || null },
        });
      }

      // (d) Match end — queue match_end push + mark bet for settlement
      if (isFinished && !(prev?.notified_end)) {
        candidates.push({
          betId: bet.id,
          userId: bet.user_id,
          token,
          eventKey: `fx${fixtureId}:match_end:bet${bet.id}`,
          eventType: 'match_end',
          title: `🏁 Partita Finita: ${home} ${homeScore} - ${awayScore} ${away}`,
          body: `Risultato finale per la tua scommessa`,
          data: { type: 'match_end', betId: bet.id, fixtureId },
        });
        betsToSettle.add(bet.id);
      }

      // (e) Queue cache update
      cacheUpdates.set(fixtureId, {
        fixture_id: fixtureId,
        home_score: homeScore,
        away_score: awayScore,
        status: newStatus,
        notified_end: isFinished ? true : (prev?.notified_end ?? false),
      });
    }

    // ── 7. Non-football sports via live_scores table ───────────────
    //
    // For NBA/NFL/MLB/NHL/etc we rely on The Odds API (populated by fetch-live-scores cron).
    // The data gives us score + completed flag only — no goal detail / red cards / assists —
    // so we surface score-change and match-end notifications per bet.

    const nonFootballBetLinks: { bet: Bet; selectionIdx: number; row: LiveScoreRow }[] = [];
    // Gather pending non-football bets (those with no fixture match or non-Soccer category)
    const matchedBetIds = new Set(betFixtureLinks.map((l) => l.bet.id + ':' + l.selectionIdx));
    const { data: liveScoreRows, error: liveScoresErr } = await supabase
      .from('live_scores')
      .select('event_id, sport_key, home_team, away_team, home_score, away_score, completed');
    if (liveScoresErr) {
      console.error('[live-score-notifier] live_scores query failed:', liveScoresErr.message);
    }
    const liveScoreList: LiveScoreRow[] = (liveScoreRows || []) as LiveScoreRow[];

    for (const bet of bets as unknown as Bet[]) {
      const sels = Array.isArray(bet.selections) ? bet.selections : [];
      for (let i = 0; i < sels.length; i++) {
        const sel = sels[i];
        if (!sel || sel.status !== 'pending' || !sel.event) continue;
        if (matchedBetIds.has(bet.id + ':' + i)) continue; // already matched to a football fixture
        const teams = parseTeams(sel.event);
        if (!teams) continue;

        for (const row of liveScoreList) {
          if (!teamMatch(row.home_team, teams.home) || !teamMatch(row.away_team, teams.away)) continue;
          nonFootballBetLinks.push({ bet, selectionIdx: i, row });
          break;
        }
      }
    }

    // For dedup of non-football score state, we reuse a separate key pattern embedded
    // in bet_notification_log (no separate cache table — cheaper).
    for (const { bet, row } of nonFootballBetLinks) {
      const token = tokenMap.get(bet.user_id);
      if (!token) continue;
      const matchLabel = `${row.home_team} vs ${row.away_team}`;

      // Score snapshot push: keyed by exact score so each change is one push per bet.
      const scoreKey = `bet${bet.id}:score:${row.event_id}:${row.home_score}-${row.away_score}`;
      // Only push if non-zero (skip the pre-game 0-0 baseline).
      if (row.home_score > 0 || row.away_score > 0) {
        candidates.push({
          betId: bet.id,
          userId: bet.user_id,
          token,
          eventKey: scoreKey,
          eventType: 'score_update',
          title: `🏀 ${row.home_team} ${row.home_score} - ${row.away_score} ${row.away_team}`,
          body: `Aggiornamento punteggio — la tua scommessa`,
          data: { type: 'score_update', betId: bet.id, eventId: row.event_id, sport: row.sport_key },
        });
      }

      if (row.completed) {
        candidates.push({
          betId: bet.id,
          userId: bet.user_id,
          token,
          eventKey: `bet${bet.id}:match_end:${row.event_id}`,
          eventType: 'match_end',
          title: `🏁 Finita: ${row.home_team} ${row.home_score} - ${row.away_score} ${row.away_team}`,
          body: `Risultato finale per la tua scommessa`,
          data: { type: 'match_end', betId: bet.id, eventId: row.event_id },
        });
        betsToSettle.add(bet.id);
      }
    }

    // ── 8. Dedup via bet_notification_log (atomic ON CONFLICT DO NOTHING) ──
    //
    // Insert one row per candidate. Postgres returns only rows that were actually
    // inserted (skipping conflicts). Those are the pushes we actually send.
    //
    // If this insert throws (e.g. table missing, RLS misconfig), we MUST throw so
    // cron sees a red invocation — otherwise we'd silently suppress every push.

    const toSend: Candidate[] = [];
    if (candidates.length > 0) {
      const rows = candidates.map((c) => ({
        bet_id: c.betId,
        user_id: c.userId,
        event_key: c.eventKey,
        event_type: c.eventType,
        payload: c.data,
      }));
      const { data: inserted, error: insertErr } = await supabase
        .from('bet_notification_log')
        .upsert(rows, { onConflict: 'bet_id,event_key', ignoreDuplicates: true })
        .select('bet_id, event_key');
      if (insertErr) {
        console.error('[live-score-notifier] bet_notification_log insert failed:', insertErr.message);
        throw new Error(`bet_notification_log upsert failed: ${insertErr.message}`);
      }
      if (inserted) {
        const lookup = new Set(inserted.map((r: { bet_id: string; event_key: string }) => `${r.bet_id}|${r.event_key}`));
        for (const c of candidates) {
          if (lookup.has(`${c.betId}|${c.eventKey}`)) toSend.push(c);
        }
      }
    }

    // ── 9. Resolve bets whose matches just ended ───────────────────

    interface BetSettlementPush { token: string; betId: string; userId: string; status: 'won' | 'lost'; profit: number; isParlay: boolean; }
    const settlementPushes: BetSettlementPush[] = [];
    // For parlay leg-lost (but bet still pending other legs) we notify once.
    interface ParlayLegLostPush { token: string; betId: string; userId: string; selectionIdx: number; selectionLabel: string; }
    const parlayLegLosses: ParlayLegLostPush[] = [];

    for (const bet of bets as unknown as Bet[]) {
      if (!betsToSettle.has(bet.id)) continue;
      const token = tokenMap.get(bet.user_id);
      if (!token) continue;
      const sels = Array.isArray(bet.selections) ? [...bet.selections] : [];
      let changed = false;

      // Attempt to settle each still-pending selection whose fixture finished.
      for (let i = 0; i < sels.length; i++) {
        const s = sels[i];
        if (!s || s.status !== 'pending') continue;
        const teams = s.event ? parseTeams(s.event) : null;
        if (!teams) continue;

        // Try football first
        const fx = fixtures.find((f) =>
          FINISHED_STATUSES.has(f.fixture.status.short)
          && teamMatch(teams.home, f.teams.home.name)
          && teamMatch(teams.away, f.teams.away.name),
        );
        if (fx) {
          const outcome = resolvePickFromScore(
            selectionText(s),
            fx.goals.home ?? 0,
            fx.goals.away ?? 0,
            fx.teams.home.name,
            fx.teams.away.name,
          );
          if (outcome) {
            sels[i] = { ...s, status: outcome };
            changed = true;
            continue;
          }
        }

        // Non-football
        const row = liveScoreList.find((r) =>
          r.completed
          && teamMatch(teams.home, r.home_team)
          && teamMatch(teams.away, r.away_team),
        );
        if (row) {
          const outcome = resolvePickFromScore(
            selectionText(s),
            row.home_score,
            row.away_score,
            row.home_team,
            row.away_team,
          );
          if (outcome) {
            sels[i] = { ...s, status: outcome };
            changed = true;
          }
        }
      }

      if (!changed) continue;

      // Roll up selection statuses into a bet-level status.
      const anyLost = sels.some((s) => s?.status === 'lost');
      const allWon = sels.every((s) => s?.status === 'won');
      const stillPending = sels.some((s) => !s?.status || s.status === 'pending');

      let newBetStatus: 'won' | 'lost' | 'pending' = 'pending';
      if (anyLost) newBetStatus = 'lost';
      else if (allWon) newBetStatus = 'won';
      else if (stillPending) newBetStatus = 'pending';

      // Persist updates (always update selections jsonb to reflect per-leg outcomes;
      // bet status only changes when we have a final verdict).
      const updatePayload: Record<string, unknown> = { selections: sels };
      if (newBetStatus !== 'pending') updatePayload.status = newBetStatus;

      const { error: updateErr } = await supabase
        .from('bets')
        .update(updatePayload)
        .eq('id', bet.id)
        .eq('status', 'pending');
      if (updateErr) {
        console.error('[live-score-notifier] bet update failed:', updateErr.message, 'bet:', bet.id);
        continue;
      }

      // Compose push(es)
      const isParlay = bet.bet_type === 'parlay' || sels.length > 1;
      if (newBetStatus === 'won') {
        const profit = (bet.potential_win ?? 0) - (bet.stake ?? 0);
        settlementPushes.push({ token, betId: bet.id, userId: bet.user_id, status: 'won', profit, isParlay });
      } else if (newBetStatus === 'lost') {
        settlementPushes.push({
          token, betId: bet.id, userId: bet.user_id, status: 'lost', profit: -(bet.stake ?? 0), isParlay,
        });
      } else if (isParlay && anyLost === false) {
        // Shouldn't hit this branch — anyLost is false and stillPending; nothing to notify.
      }

      // Parlay-leg-lost push: if parlay is now lost because one leg lost but others were pending,
      // or if newBetStatus stayed 'pending' but some leg just flipped to 'lost' (rare — only if
      // a prior settlement call already handled the final-verdict push).
      if (isParlay) {
        const originalSels = Array.isArray(bet.selections) ? bet.selections : [];
        for (let i = 0; i < sels.length; i++) {
          const before = originalSels[i]?.status;
          const after = sels[i]?.status;
          if (before === 'pending' && after === 'lost' && newBetStatus !== 'lost') {
            parlayLegLosses.push({
              token,
              betId: bet.id,
              userId: bet.user_id,
              selectionIdx: i,
              selectionLabel: sels[i]?.event || `Selezione ${i + 1}`,
            });
          }
        }
      }
    }

    // Build settlement & parlay-leg candidates and run them through the same dedup path.
    const settlementCandidates: Candidate[] = [];
    for (const s of settlementPushes) {
      const eventKey = `bet${s.betId}:settled`;
      if (s.status === 'won') {
        settlementCandidates.push({
          betId: s.betId,
          userId: s.userId,
          token: s.token,
          eventKey,
          eventType: s.isParlay ? 'parlay_won' : 'bet_settled',
          title: s.isParlay ? `🎉 MULTIPLA VINTA!` : `🎉 Scommessa VINTA!`,
          body: `Profitto: ${formatMoney(s.profit)} — tocca per i dettagli`,
          data: { type: s.isParlay ? 'parlay_won' : 'bet_settled', betId: s.betId, profit: s.profit },
        });
      } else {
        settlementCandidates.push({
          betId: s.betId,
          userId: s.userId,
          token: s.token,
          eventKey,
          eventType: s.isParlay ? 'parlay_lost' : 'bet_settled',
          title: s.isParlay ? `💔 Multipla in rosso` : `😞 Scommessa persa`,
          body: `Perdita: ${formatMoney(s.profit)}`,
          data: { type: s.isParlay ? 'parlay_lost' : 'bet_settled', betId: s.betId, profit: s.profit },
        });
      }
    }
    for (const p of parlayLegLosses) {
      settlementCandidates.push({
        betId: p.betId,
        userId: p.userId,
        token: p.token,
        eventKey: `bet${p.betId}:parlay_leg_lost:${p.selectionIdx}`,
        eventType: 'parlay_leg_lost',
        title: `❌ Leg persa — multipla a rischio`,
        body: `${p.selectionLabel}`,
        data: { type: 'parlay_leg_lost', betId: p.betId, selectionIdx: p.selectionIdx },
      });
    }

    if (settlementCandidates.length > 0) {
      const rows = settlementCandidates.map((c) => ({
        bet_id: c.betId,
        user_id: c.userId,
        event_key: c.eventKey,
        event_type: c.eventType,
        payload: c.data,
      }));
      const { data: inserted, error: insertErr } = await supabase
        .from('bet_notification_log')
        .upsert(rows, { onConflict: 'bet_id,event_key', ignoreDuplicates: true })
        .select('bet_id, event_key');
      if (insertErr) {
        console.error('[live-score-notifier] settlement log insert failed:', insertErr.message);
        throw new Error(`settlement bet_notification_log upsert failed: ${insertErr.message}`);
      }
      if (inserted) {
        const lookup = new Set(inserted.map((r: { bet_id: string; event_key: string }) => `${r.bet_id}|${r.event_key}`));
        for (const c of settlementCandidates) {
          if (lookup.has(`${c.betId}|${c.eventKey}`)) toSend.push(c);
        }
      }
    }

    // ── 10. Send Expo pushes ───────────────────────────────────────
    //
    // For each batch we pair the returned ticket with the candidate (by index)
    // so we can persist ticket_id back onto bet_notification_log. The receipt
    // poller in step 0 uses that ticket_id to learn the true APNs outcome.

    const invalidTokens = new Set<string>();
    let sent = 0;
    const ticketUpdates: { betId: string; eventKey: string; ticketId: string }[] = [];
    if (toSend.length > 0) {
      const messages: ExpoMessage[] = toSend.map((c) => ({
        to: c.token,
        title: c.title,
        body: c.body,
        data: c.data,
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      }));
      for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
        const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
        const batchCandidates = toSend.slice(i, i + EXPO_BATCH_SIZE);
        const tickets = await sendExpoBatch(batch);
        for (let j = 0; j < tickets.length; j++) {
          const t = tickets[j];
          const msg = batch[j];
          const cand = batchCandidates[j];
          if (t?.status === 'ok') {
            sent++;
            if (t.id && cand) {
              ticketUpdates.push({ betId: cand.betId, eventKey: cand.eventKey, ticketId: t.id });
            }
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

    // Stamp ticket_id onto the log rows we just inserted. Parallel single-row
    // updates keyed by (bet_id, event_key) — the unique constraint guarantees
    // a single row per key so each update touches exactly one row.
    if (ticketUpdates.length > 0) {
      await Promise.all(
        ticketUpdates.map((u) =>
          supabase
            .from('bet_notification_log')
            .update({ ticket_id: u.ticketId })
            .eq('bet_id', u.betId)
            .eq('event_key', u.eventKey),
        ),
      );
    }

    // ── 11. Persist fixture cache ──────────────────────────────────

    if (cacheUpdates.size > 0) {
      const rows = [...cacheUpdates.values()];
      const { error: upsertError } = await supabase
        .from('live_score_cache')
        .upsert(rows, { onConflict: 'fixture_id' });
      if (upsertError) console.error('[live-score-notifier] cache upsert failed:', upsertError.message);
    }

    if (invalidTokens.size > 0) {
      await clearInvalidTokens([...invalidTokens]);
    }

    const body = {
      status: 'ok',
      fixtures_live: fixtures.length,
      fixtures_relevant: relevantFixtureIds.size,
      events_fetched: fixturesToFetchEvents.length,
      non_football_matches: nonFootballBetLinks.length,
      bets_checked: bets.length,
      bets_settled: settlementPushes.length,
      parlay_legs_lost: parlayLegLosses.length,
      candidates: candidates.length + settlementCandidates.length,
      pushes_sent: sent,
      tokens_invalidated: invalidTokens.size + receiptsSummary.tokensInvalidated,
      receipts: receiptsSummary,
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
