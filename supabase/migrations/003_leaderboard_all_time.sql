// Create view for all-time leaderboard
CREATE OR REPLACE VIEW public.leaderboard_all_time AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  count(b.id) AS total_bets,
  count(CASE WHEN b.status = 'won' THEN 1 END) AS won_bets,
  count(CASE WHEN b.status = 'lost' THEN 1 END) AS lost_bets,
  coalesce(sum(CASE WHEN b.status = 'won' THEN b.potential_win - b.stake ELSE 0 END), 0) -
  coalesce(sum(CASE WHEN b.status = 'lost' THEN b.stake ELSE 0 END), 0) AS profit_loss,
  CASE 
    WHEN count(CASE WHEN b.status IN ('won', 'lost') THEN 1 END) > 0 
    THEN round(
      count(CASE WHEN b.status = 'won' THEN 1 END)::numeric / 
      count(CASE WHEN b.status IN ('won', 'lost') THEN 1 END) * 100, 
      2
    )
    ELSE 0 
  END AS win_rate,
  CASE 
    WHEN coalesce(sum(b.stake), 0) > 0 
    THEN round(
      (coalesce(sum(CASE WHEN b.status = 'won' THEN b.potential_win - b.stake ELSE 0 END), 0) -
       coalesce(sum(CASE WHEN b.status = 'lost' THEN b.stake ELSE 0 END), 0)) / 
      sum(b.stake) * 100, 
      2
    )
    ELSE 0 
  END AS roi
FROM public.profiles p
LEFT JOIN public.bets b ON p.id = b.user_id
GROUP BY p.id, p.username, p.avatar_url
ORDER BY profit_loss DESC;