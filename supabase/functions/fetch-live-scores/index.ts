import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ODDS_API_KEY = Deno.env.get("ODDS_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const SPORTS = [
  "americanfootball_nfl",
  "basketball_nba",
  "baseball_mlb",
  "icehockey_nhl",
  "soccer_epl",
  "soccer_spain_la_liga",
  "mma_mixed_martial_arts",
];

interface OddsApiScore {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
  completed: boolean;
  last_update: string;
}

serve(async (req: Request) => {
  try {
    if (!ODDS_API_KEY) {
      return new Response(JSON.stringify({ error: "ODDS_API_KEY not set" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let totalUpserted = 0;
    const errors: string[] = [];

    for (const sport of SPORTS) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${sport}/scores?apiKey=${ODDS_API_KEY}&daysFrom=1`;
        const res = await fetch(url);

        if (!res.ok) {
          errors.push(`${sport}: HTTP ${res.status}`);
          continue;
        }

        const games: OddsApiScore[] = await res.json();

        if (!Array.isArray(games) || games.length === 0) continue;

        const rows = games.map((game) => {
          let homeScore = 0;
          let awayScore = 0;

          if (game.scores && Array.isArray(game.scores)) {
            const homeEntry = game.scores.find(
              (s) => s.name === game.home_team
            );
            const awayEntry = game.scores.find(
              (s) => s.name === game.away_team
            );
            homeScore = homeEntry ? parseInt(homeEntry.score, 10) || 0 : 0;
            awayScore = awayEntry ? parseInt(awayEntry.score, 10) || 0 : 0;
          }

          return {
            event_id: game.id,
            sport_key: game.sport_key,
            home_team: game.home_team,
            away_team: game.away_team,
            home_score: homeScore,
            away_score: awayScore,
            completed: game.completed ?? false,
            last_update: game.last_update || new Date().toISOString(),
          };
        });

        const { error } = await supabase.from("live_scores").upsert(rows, {
          onConflict: "event_id",
        });

        if (error) {
          errors.push(`${sport}: upsert error - ${error.message}`);
        } else {
          totalUpserted += rows.length;
        }
      } catch (err) {
        errors.push(`${sport}: ${(err as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        upserted: totalUpserted,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
