import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, Dimensions, TouchableOpacity, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { colors } from '../constants/colors';
import { useBets, useBankroll, useLiveScores, useSubscription } from '../hooks';
import { Bet } from '../types';
import AppBackground from '../components/AppBackground';
import PageHeader from '../components/PageHeader';
import { useTranslation } from '../contexts/LanguageContext';

const SCREEN_W = Dimensions.get('window').width;
const CHART_WIDTH = Math.min(SCREEN_W - 72, 380);
const CHART_COLORS = [colors.success, colors.accent, colors.pending, '#A78BFA', '#F472B6', '#34D399', '#FB923C', '#38BDF8'];
const AXIS_COLOR = 'rgba(148,163,184,0.25)';
const LABEL_COLOR = '#94A3B8';

/* ─── Custom Chart Components ─── */

function CustomVerticalBars({ data, height = 140 }: { data: { label: string; value: number; color: string }[]; height?: number }) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, paddingHorizontal: 8, gap: 2 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            <Text style={{ fontSize: 10, color: LABEL_COLOR, marginBottom: 4, fontWeight: '600' }}>
              {d.value > 0 ? Math.abs(d.value).toFixed(0) + '%' : '0%'}
            </Text>
            <View style={{
              width: '65%',
              maxWidth: 42,
              height: Math.max((d.value / maxVal) * (height - 30), 4),
              backgroundColor: d.color,
              borderRadius: 6,
              minHeight: 4,
            }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 8, marginTop: 10, gap: 2 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: LABEL_COLOR, textAlign: 'center' }} numberOfLines={2}>{d.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function CustomHorizontalBars({ data }: { data: { label: string; value: number; color: string }[] }) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <View style={{ gap: 12, paddingVertical: 4 }}>
      {data.map((d, i) => (
        <View key={i} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{d.label}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: d.color }}>{d.value}</Text>
          </View>
          <View style={{ height: 8, backgroundColor: 'rgba(148,163,184,0.1)', borderRadius: 4, overflow: 'hidden' }}>
            <View style={{
              height: '100%',
              width: `${Math.max((d.value / maxVal) * 100, 2)}%`,
              backgroundColor: d.color,
              borderRadius: 4,
            }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function CustomDonut({ data, total }: { data: { value: number; color: string; text: string }[]; total: number }) {
  // Simple ring segments using percentage-based widths
  const segments = data.map(d => ({ ...d, pct: total > 0 ? (d.value / total) * 100 : 0 }));
  return (
    <View style={{ alignItems: 'center', paddingVertical: 12 }}>
      {/* Ring visualization */}
      <View style={{ width: 160, height: 160, borderRadius: 80, borderWidth: 18, borderColor: 'rgba(148,163,184,0.08)', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {/* Colored arc overlay using border trick */}
        <View style={{ position: 'absolute', top: -18, left: -18, width: 160, height: 160, borderRadius: 80, overflow: 'hidden' }}>
          {segments.map((seg, i) => {
            const startAngle = segments.slice(0, i).reduce((a, s) => a + (s.pct / 100) * 360, 0);
            return (
              <View key={i} style={{
                position: 'absolute',
                width: 160,
                height: 160,
                borderRadius: 80,
                borderWidth: 18,
                borderColor: 'transparent',
                borderTopColor: seg.color,
                borderRightColor: seg.pct > 25 ? seg.color : 'transparent',
                borderBottomColor: seg.pct > 50 ? seg.color : 'transparent',
                borderLeftColor: seg.pct > 75 ? seg.color : 'transparent',
                transform: [{ rotate: `${startAngle}deg` }],
              }} />
            );
          })}
        </View>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.textPrimary }}>{total}</Text>
        <Text style={{ fontSize: 11, color: LABEL_COLOR, marginTop: 2 }}>bets</Text>
      </View>
      {/* Legend */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 20, gap: 4 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 10, marginVertical: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color, marginRight: 6 }} />
            <Text style={{ fontSize: 13, color: 'rgba(176,198,228,0.9)', fontWeight: '500' }}>{d.text} ({d.value})</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AnimatedValue({ value, prefix = '', suffix = '', color = colors.textPrimary, duration = 600, decimals = 2 }: {
  value: number;
  prefix?: string;
  suffix?: string;
  color?: string;
  duration?: number;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(value);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setDisplay(0);
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    }).start();
  }, [value]);

  useEffect(() => {
    const sub = anim.addListener(({ value: v }) => {
      setDisplay(value * v);
    });
    return () => anim.removeListener(sub);
  }, [anim, value]);

  const formatted = decimals === 0 ? Math.round(display) : display.toFixed(decimals);
  return <Text style={[styles.animValue, { color }]}>{prefix}{formatted}{suffix}</Text>;
}

function getProfitOverTime(bets: Bet[]) {
  const settled = bets.filter(b => b.status === 'won' || b.status === 'lost');
  if (settled.length === 0) return [{ value: 0, label: '' }];

  const byDate: Record<string, number> = {};
  settled.forEach(b => {
    const d = b.date.split('T')[0] || b.date.slice(0, 10);
    if (!byDate[d]) byDate[d] = 0;
    if (b.status === 'won') byDate[d] += b.stake * b.totalOdds - b.stake;
    else byDate[d] -= b.stake;
  });

  const sorted = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
  let cum = 0;
  return sorted.map(([d, delta]) => {
    cum += delta;
    return { value: cum, label: d.slice(5) };
  });
}

// Helper: compute ROI stats grouped by a key
function computeGroupedStats(bets: Bet[], keyFn: (b: Bet) => string) {
  const groups: Record<string, { count: number; wins: number; wagered: number; returned: number }> = {};
  // Only include decided bets (won or lost) in statistics
  const settledBets = bets.filter(b => b.status === 'won' || b.status === 'lost');
  
  settledBets.forEach(b => {
    const key = keyFn(b);
    if (!groups[key]) groups[key] = { count: 0, wins: 0, wagered: 0, returned: 0 };
    groups[key].count++;
    groups[key].wagered += b.stake;
    if (b.status === 'won') {
      groups[key].wins++;
      groups[key].returned += b.stake * b.totalOdds;
    }
  });
  return Object.entries(groups)
    .map(([key, s]) => ({
      key,
      count: s.count,
      wins: s.wins,
      winRate: s.count > 0 ? (s.wins / s.count) * 100 : 0,
      wagered: s.wagered,
      profit: s.returned - s.wagered,
      roi: s.wagered > 0 ? ((s.returned - s.wagered) / s.wagered) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export default function StatsScreen() {
  const { t } = useTranslation();
  const { bets } = useBets();
  const { isConfigured, currentBalance, settings: bankrollSettings, history: bankrollHistory, changePercent, unitSize1Pct, unitSize2Pct } = useBankroll();
  const { matchBetToScore } = useLiveScores();
  const { canUseFeature, openPaywall, tier } = useSubscription();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, []);

  const totalBets = bets.length;
  const wonBets = bets.filter(b => b.status === 'won');
  const lostBets = bets.filter(b => b.status === 'lost');
  const pendingBets = bets.filter(b => b.status === 'pending');

  const decidedBets = wonBets.length + lostBets.length;
  const winRate = decidedBets > 0 ? Math.round((wonBets.length / decidedBets) * 100) : 0;
  const totalWagered = bets.reduce((sum, b) => sum + b.stake, 0);
  const decidedWagered = wonBets.reduce((sum, b) => sum + b.stake, 0) + lostBets.reduce((sum, b) => sum + b.stake, 0);
  const totalWonProfit = wonBets.reduce((sum, b) => sum + (b.potentialWin - b.stake), 0);
  const totalLostStake = lostBets.reduce((sum, b) => sum + b.stake, 0);
  const netProfit = totalWonProfit - totalLostStake;
  const roi = decidedWagered > 0 ? ((netProfit / decidedWagered) * 100).toFixed(1) : '0.0';

  const profitData = getProfitOverTime(bets);
  const perfData = [
    { value: wonBets.length, label: 'Win', frontColor: colors.success },
    { value: lostBets.length, label: 'Loss', frontColor: colors.error },
    { value: pendingBets.length, label: 'Pending', frontColor: colors.pending },
  ].filter(d => d.value > 0);

  // Auto-reclassify "Other" bets based on event/selection text (team name heuristics)
  const inferCategory = (b: Bet): string => {
    if (b.category !== 'Other') return b.category;
    const texts = [b.title, b.league || ''];
    if (b.selections) b.selections.forEach(s => { texts.push(s.event || ''); texts.push(s.selection || ''); });
    const hay = texts.join(' ').toLowerCase();
    const soccerTeams = ['madrid', 'barcelona', 'juventus', 'milan', 'inter', 'napoli', 'roma', 'lazio',
      'atletico', 'sevilla', 'bayern', 'dortmund', 'psg', 'lyon', 'marseille', 'ajax', 'porto', 'benfica',
      'liverpool', 'chelsea', 'arsenal', 'tottenham', 'manchester', 'sporting', 'celtic', 'rangers',
      'galatasaray', 'fenerbahce', 'fiorentina', 'atalanta', 'serie a', 'la liga', 'premier league',
      'champions league', 'bundesliga', 'ligue 1', 'europa league', 'calcio', 'football', 'soccer'];
    if (soccerTeams.some(t => hay.includes(t))) return 'Soccer';
    if (/\b(lakers|celtics|warriors|bulls|nets|knicks|heat|bucks|nuggets|nba)\b/.test(hay)) return 'NBA';
    if (/\b(patriots|cowboys|eagles|chiefs|packers|nfl|49ers|ravens)\b/.test(hay)) return 'NFL';
    if (/\b(djokovic|nadal|federer|sinner|alcaraz|tennis|atp|wta)\b/.test(hay)) return 'Tennis';
    if (/\b(ufc|mma)\b/.test(hay)) return 'UFC';
    return 'Other';
  };

  const categoryStats: Record<string, { count: number; wins: number }> = {};
  bets.forEach(bet => {
    const cat = inferCategory(bet);
    if (!categoryStats[cat]) categoryStats[cat] = { count: 0, wins: 0 };
    categoryStats[cat].count++;
    if (bet.status === 'won') categoryStats[cat].wins++;
  });

  const pieData = Object.entries(categoryStats)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 6)
    .map(([cat, s], i) => ({
      value: s.count,
      color: CHART_COLORS[i % CHART_COLORS.length],
      text: cat,
    }));

  const avgOdds = totalBets > 0
    ? (bets.reduce((s, b) => s + b.totalOdds, 0) / totalBets).toFixed(1)
    : '—';
  const biggestWin = wonBets.length > 0
    ? Math.max(...wonBets.map(b => b.stake * b.totalOdds - b.stake))
    : 0;
  const biggestLoss = lostBets.length > 0 ? Math.max(...lostBets.map(b => b.stake)) : 0;

  const hasData = totalBets > 0;

  // Bankroll curve data
  const bankrollCurveData = bankrollHistory.length > 1
    ? bankrollHistory.map(h => ({
        value: h.balance,
        label: h.date.slice(5),
      }))
    : [];

  // --- ROI per Sport (category) ---
  const sportStats = computeGroupedStats(bets, b => inferCategory(b));
  const sportBarData = sportStats.slice(0, 6).map((s, i) => ({
    value: Math.abs(s.roi),
    label: s.key,
    frontColor: s.roi >= 0 ? colors.success : colors.error,
  }));

  // --- ROI per Bet Type ---
  const betTypeStats = computeGroupedStats(bets, b => b.betType || 'single');
  const betTypeBarData = betTypeStats.map((s, i) => ({
    value: Math.abs(s.roi),
    label: s.key === 'single' ? t('single') : s.key === 'parlay' ? t('parlay') : s.key,
    frontColor: s.roi >= 0 ? colors.success : colors.error,
  }));

  // --- ROI per Sportsbook ---
  const bookStats = computeGroupedStats(bets, b => b.bookmaker);

  // --- ROI per League ---
  const leagueStats = computeGroupedStats(bets, b => b.league || 'Unspecified');
  const hasRealLeagues = leagueStats.some(s => s.key !== 'Unspecified');
  const leagueBarData = hasRealLeagues
    ? leagueStats.filter(s => s.key !== 'Unspecified').slice(0, 6).map(s => ({
        value: Math.abs(s.roi),
        label: s.key,
        frontColor: s.roi >= 0 ? colors.success : colors.error,
      }))
    : [];

  // --- Bookmaker URL helper ---
  const bookmakerUrls: Record<string, string> = {
    'bet365': 'https://www.bet365.com',
    'draftkings': 'https://www.draftkings.com',
    'fanduel': 'https://www.fanduel.com',
    'william hill': 'https://www.williamhill.com',
    'betfair': 'https://www.betfair.com',
    'pinnacle': 'https://www.pinnacle.com',
    'betmgm': 'https://www.betmgm.com',
    'caesars': 'https://www.caesars.com/sportsbook',
    'pointsbet': 'https://www.pointsbet.com',
    'betway': 'https://www.betway.com',
    'unibet': 'https://www.unibet.com',
    'bwin': 'https://www.bwin.com',
    'ladbrokes': 'https://www.ladbrokes.com',
  };
  const getBookmakerUrl = (name: string): string | null => {
    return bookmakerUrls[name.toLowerCase()] || null;
  };

  // --- Pattern Recognition Insights ---
  const insights: { icon: keyof typeof Ionicons.glyphMap; text: string; color: string }[] = [];
  if (sportStats.length > 0) {
    const bestSport = sportStats.reduce((a, b) => a.roi > b.roi ? a : b);
    const worstSport = sportStats.reduce((a, b) => a.roi < b.roi ? a : b);
    if (bestSport.roi > 0) {
      insights.push({ icon: 'trophy', text: `Best sport: ${bestSport.key} (ROI +${bestSport.roi.toFixed(1)}%)`, color: colors.success });
    }
    if (worstSport.roi < 0 && worstSport.key !== bestSport.key) {
      insights.push({ icon: 'trending-down', text: `Worst sport: ${worstSport.key} (ROI ${worstSport.roi.toFixed(1)}%)`, color: colors.error });
    }
  }
  if (bookStats.length > 0) {
    const worstBook = bookStats.reduce((a, b) => a.roi < b.roi ? a : b);
    if (worstBook.roi < 0) {
      insights.push({ icon: 'alert-circle', text: `Worst bookmaker: ${worstBook.key} (ROI ${worstBook.roi.toFixed(1)}%)`, color: colors.error });
    }
    const bestBook = bookStats.reduce((a, b) => a.roi > b.roi ? a : b);
    if (bestBook.roi > 0 && bestBook.key !== worstBook.key) {
      insights.push({ icon: 'star', text: `Best bookmaker: ${bestBook.key} (ROI +${bestBook.roi.toFixed(1)}%)`, color: colors.success });
    }
  }
  if (betTypeStats.length >= 2) {
    const singleStat = betTypeStats.find(s => s.key === 'single');
    const parlayStat = betTypeStats.find(s => s.key === 'parlay');
    if (singleStat && parlayStat) {
      if (parlayStat.roi < singleStat.roi) {
        insights.push({ icon: 'information-circle', text: `Parlays have lower ROI (${parlayStat.roi.toFixed(1)}%) than singles (${singleStat.roi.toFixed(1)}%)`, color: colors.accent });
      } else {
        insights.push({ icon: 'flash', text: `Parlays outperform singles: ${parlayStat.roi.toFixed(1)}% vs ${singleStat.roi.toFixed(1)}%`, color: colors.success });
      }
    }
  }
  if (hasData) {
    const avgStake = totalWagered / totalBets;
    insights.push({ icon: 'cash', text: `Avg stake: $${avgStake.toFixed(0)} | Avg odds: ${avgOdds}x`, color: colors.textSecondary });
  }

  // --- Live Monitoring: pending bets ---
  const liveBets = pendingBets.slice(0, 5);

  return (
    <View style={styles.container}>
      <AppBackground />
      <PageHeader title={t('stats')} />

      <Animated.View style={[styles.wrapper, { opacity: fadeAnim }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>{t('netPL') || 'Net Profit'}</Text>
            <AnimatedValue
              value={Math.abs(netProfit)}
              prefix={netProfit >= 0 ? '+$' : '-$'}
              color={netProfit >= 0 ? colors.success : colors.error}
            />
            <Text style={styles.heroSub}>{t('roi') || 'ROI'} {roi}%</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{totalBets}</Text>
              <Text style={styles.statLabel}>{t('totalBets')}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: colors.success }]}>{winRate}%</Text>
              <Text style={styles.statLabel}>{t('winRate')}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>${totalWagered.toFixed(0)}</Text>
              <Text style={styles.statLabel}>{t('stake')}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{avgOdds}x</Text>
              <Text style={styles.statLabel}>Avg odds</Text>
            </View>
          </View>

          {/* Pattern Recognition Insights */}
          {insights.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Insights</Text>
              {!canUseFeature('advancedAnalytics') ? (
                <TouchableOpacity
                  style={styles.lockedOverlay}
                  onPress={() => openPaywall('Advanced Insights require Pro. Upgrade to unlock full analytics.')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="lock-closed" size={22} color="#FBBF24" />
                  <Text style={styles.lockedText}>Upgrade to Pro to unlock Insights</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.insightsCard}>
                {insights.map((ins, i) => (
                  <View key={i} style={styles.insightRow}>
                    <Ionicons name={ins.icon} size={16} color={ins.color} />
                    <Text style={[styles.insightText, { color: ins.color }]}>{ins.text}</Text>
                  </View>
                ))}
                </View>
              )}
            </View>
          )}

          {/* Bankroll Curve */}
          {isConfigured && canUseFeature('bankrollEnabled') && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Bankroll Curve</Text>
              <View style={styles.chartCard}>
                {bankrollCurveData.length > 1 ? (
                  <>
                    <LineChart
                      data={bankrollCurveData}
                      width={CHART_WIDTH - 50}
                      height={150}
                      spacing={bankrollCurveData.length > 5 ? 40 : 60}
                      initialSpacing={10}
                      endSpacing={10}
                      color={changePercent >= 0 ? colors.success : colors.error}
                      thickness={2.5}
                      hideDataPoints={bankrollCurveData.length > 10}
                      dataPointsColor={colors.accent}
                      dataPointsRadius={4}
                      startFillColor={changePercent >= 0 ? colors.success + '30' : colors.error + '30'}
                      endFillColor={changePercent >= 0 ? colors.success + '05' : colors.error + '05'}
                      areaChart
                      isAnimated
                      animationDuration={800}
                      yAxisColor={AXIS_COLOR}
                      xAxisColor={AXIS_COLOR}
                      yAxisThickness={1}
                      xAxisThickness={1}
                      yAxisTextStyle={{ color: LABEL_COLOR, fontSize: 10 }}
                      xAxisLabelTextStyle={{ color: LABEL_COLOR, fontSize: 10 }}
                      noOfSections={4}
                      rulesType="dashed"
                      rulesColor="rgba(148,163,184,0.15)"
                    />
                    <View style={styles.bankrollStats}>
                      <View style={styles.bankrollStatItem}>
                        <Text style={styles.bankrollStatLabel}>Balance</Text>
                        <Text style={[styles.bankrollStatValue, { color: colors.textPrimary }]}>
                          ${currentBalance?.toFixed(0) || '0'}
                        </Text>
                      </View>
                      <View style={styles.bankrollStatItem}>
                        <Text style={styles.bankrollStatLabel}>Change</Text>
                        <Text style={[styles.bankrollStatValue, { color: changePercent >= 0 ? colors.success : colors.error }]}>
                          {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%
                        </Text>
                      </View>
                      <View style={styles.bankrollStatItem}>
                        <Text style={styles.bankrollStatLabel}>Unit (1-2%)</Text>
                        <Text style={[styles.bankrollStatValue, { color: colors.accent }]}>
                          ${unitSize1Pct.toFixed(0)}-${unitSize2Pct.toFixed(0)}
                        </Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.chartEmpty}>
                    <Ionicons name="wallet-outline" size={32} color={colors.textMuted} />
                    <Text style={styles.chartEmptyText}>
                      {bankrollHistory.length === 0
                        ? 'No bankroll data yet'
                        : 'Settle bets to see your bankroll curve'}
                    </Text>
                    {currentBalance !== null && (
                      <Text style={[styles.chartEmptyText, { marginTop: 4, color: colors.textSecondary }]}>
                        Current: ${currentBalance.toFixed(0)} | Unit: ${unitSize1Pct.toFixed(0)}-${unitSize2Pct.toFixed(0)}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Profit over time — keep LineChart, it renders OK for line graphs */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profit') || 'Profit over time'}</Text>
            <View style={styles.chartCard}>
              {profitData.length > 1 ? (
                <LineChart
                  data={profitData}
                  width={CHART_WIDTH - 50}
                  height={140}
                  spacing={profitData.length > 5 ? 40 : 60}
                  initialSpacing={10}
                  endSpacing={10}
                  color={netProfit >= 0 ? colors.success : colors.error}
                  thickness={2.5}
                  hideDataPoints={profitData.length > 10}
                  dataPointsColor={colors.accent}
                  dataPointsRadius={4}
                  startFillColor={netProfit >= 0 ? colors.success + '30' : colors.error + '30'}
                  endFillColor={netProfit >= 0 ? colors.success + '05' : colors.error + '05'}
                  areaChart
                  isAnimated
                  animationDuration={800}
                  yAxisColor={AXIS_COLOR}
                  xAxisColor={AXIS_COLOR}
                  yAxisThickness={1}
                  xAxisThickness={1}
                  yAxisTextStyle={{ color: LABEL_COLOR, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: LABEL_COLOR, fontSize: 10 }}
                  noOfSections={4}
                  rulesType="dashed"
                  rulesColor="rgba(148,163,184,0.12)"
                />
              ) : (
                <View style={styles.chartEmpty}>
                  <Ionicons name="trending-up-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.chartEmptyText}>Add settled bets to see profit trend</Text>
                </View>
              )}
            </View>
          </View>

          {/* ROI per Sport — Custom Bars */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ROI per Sport</Text>
            {!canUseFeature('advancedAnalytics') ? (
              <TouchableOpacity
                style={styles.lockedOverlay}
                onPress={() => openPaywall('ROI analytics require Pro. Upgrade to unlock detailed breakdowns.')}
                activeOpacity={0.8}
              >
                <Ionicons name="lock-closed" size={22} color="#FBBF24" />
                <Text style={styles.lockedText}>Upgrade to Pro to unlock ROI analytics</Text>
              </TouchableOpacity>
            ) : (
            <View style={styles.chartCard}>
              {sportBarData.length > 0 ? (
                <>
                  <CustomVerticalBars
                    data={sportBarData.map(s => ({ label: s.label, value: s.value, color: s.frontColor }))}
                    height={130}
                  />
                  <View style={styles.roiTable}>
                    {sportStats.slice(0, 6).map((s, i) => (
                      <View key={s.key} style={styles.roiTableRow}>
                        <Text style={styles.roiTableName} numberOfLines={1}>{s.key}</Text>
                        <Text style={styles.roiTableCount}>{s.count}</Text>
                        <Text style={[styles.roiTableRoi, { color: s.roi >= 0 ? colors.success : colors.error }]}>
                          {s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%
                        </Text>
                        <Text style={[styles.roiTableProfit, { color: s.profit >= 0 ? colors.success : colors.error }]}>
                          {s.profit >= 0 ? '+$' : '-$'}{Math.abs(s.profit).toFixed(0)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <View style={styles.chartEmpty}>
                  <Ionicons name="basketball-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.chartEmptyText}>Add bets to see ROI by sport</Text>
                </View>
              )}
            </View>
            )}
          </View>

          {/* ROI per Bet Type — Custom Bars */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ROI per Bet Type</Text>
            <View style={styles.chartCard}>
              {betTypeBarData.length > 0 ? (
                <>
                  <CustomVerticalBars
                    data={betTypeBarData.map(s => ({ label: s.label, value: s.value, color: s.frontColor }))}
                    height={130}
                  />
                  <View style={styles.roiTable}>
                    {betTypeStats.map(s => (
                      <View key={s.key} style={styles.roiTableRow}>
                        <Text style={styles.roiTableName}>{s.key}</Text>
                        <Text style={styles.roiTableCount}>{s.count} bets</Text>
                        <Text style={[styles.roiTableRoi, { color: s.roi >= 0 ? colors.success : colors.error }]}>
                          {s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%
                        </Text>
                        <Text style={[styles.roiTableProfit, { color: s.profit >= 0 ? colors.success : colors.error }]}>
                          {s.profit >= 0 ? '+$' : '-$'}{Math.abs(s.profit).toFixed(0)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <View style={styles.chartEmpty}>
                  <Ionicons name="layers-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.chartEmptyText}>Add bets to compare bet types</Text>
                </View>
              )}
            </View>
          </View>

          {/* ROI per League — Custom Bars */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ROI per League</Text>
            <View style={styles.chartCard}>
              {hasRealLeagues && leagueBarData.length > 0 ? (
                <>
                  <CustomVerticalBars
                    data={leagueBarData.map(s => ({ label: s.label, value: s.value, color: s.frontColor }))}
                    height={130}
                  />
                  <View style={styles.roiTable}>
                    {leagueStats.filter(s => s.key !== 'Unspecified').slice(0, 6).map(s => (
                      <View key={s.key} style={styles.roiTableRow}>
                        <Text style={styles.roiTableName} numberOfLines={1}>{s.key}</Text>
                        <Text style={styles.roiTableCount}>{s.count}</Text>
                        <Text style={[styles.roiTableRoi, { color: s.roi >= 0 ? colors.success : colors.error }]}>
                          {s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%
                        </Text>
                        <Text style={[styles.roiTableProfit, { color: s.profit >= 0 ? colors.success : colors.error }]}>
                          {s.profit >= 0 ? '+$' : '-$'}{Math.abs(s.profit).toFixed(0)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <View style={styles.chartEmpty}>
                  <Ionicons name="flag-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.chartEmptyText}>Add league to bets to see ROI by league</Text>
                </View>
              )}
            </View>
          </View>

          {/* Win / Loss / Pending — Custom Horizontal Bars */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('statsWLP') || 'Win / Loss / Pending'}</Text>
            <View style={styles.chartCard}>
              {perfData.length > 0 ? (
                <CustomHorizontalBars
                  data={perfData.map(d => ({ label: d.label === 'Win' ? 'Won' : d.label === 'Loss' ? 'Lost' : d.label, value: d.value, color: d.frontColor }))}
                />
              ) : (
                <View style={styles.chartEmpty}>
                  <Text style={styles.chartEmptyText}>No settled bets yet</Text>
                </View>
              )}
            </View>
          </View>

          {/* By category — Custom Donut */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>By Category</Text>
            <View style={styles.chartCard}>
              {pieData.length > 0 ? (
                <CustomDonut data={pieData} total={totalBets} />
              ) : (
                <View style={styles.chartEmpty}>
                  <Ionicons name="pie-chart-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.chartEmptyText}>Add bets to see category breakdown</Text>
                </View>
              )}
            </View>
          </View>

          {/* Portfolio: By Sportsbook */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Portfolio by Sportsbook</Text>
            {bookStats.length > 0 ? (
              bookStats.map((book, i) => (
                <View key={book.key} style={styles.bookCard}>
                  <View style={styles.bookHeader}>
                    <Ionicons name="business-outline" size={18} color={colors.accent} />
                    <Text style={styles.bookName}>{book.key}</Text>
                    <View style={[styles.bookRoiBadge, { backgroundColor: book.roi >= 0 ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
                      <Text style={[styles.bookRoiText, { color: book.roi >= 0 ? colors.success : colors.error }]}>
                        {book.roi >= 0 ? '+' : ''}{book.roi.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                  <View style={styles.bookStats}>
                    <View style={styles.bookStatCol}>
                      <Text style={styles.bookStatLabel}>Wagered</Text>
                      <Text style={styles.bookStatVal}>${book.wagered.toFixed(0)}</Text>
                    </View>
                    <View style={styles.bookStatCol}>
                      <Text style={styles.bookStatLabel}>P/L</Text>
                      <Text style={[styles.bookStatVal, { color: book.profit >= 0 ? colors.success : colors.error }]}>
                        {book.profit >= 0 ? '+$' : '-$'}{Math.abs(book.profit).toFixed(0)}
                      </Text>
                    </View>
                    <View style={styles.bookStatCol}>
                      <Text style={styles.bookStatLabel}>Bets</Text>
                      <Text style={styles.bookStatVal}>{book.count}</Text>
                    </View>
                    <View style={styles.bookStatCol}>
                      <Text style={styles.bookStatLabel}>Win%</Text>
                      <Text style={styles.bookStatVal}>{book.winRate.toFixed(0)}%</Text>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View style={[styles.chartCard, { minHeight: 80 }]}>
                <View style={styles.chartEmpty}>
                  <Ionicons name="business-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.chartEmptyText}>Add bets to see sportsbook breakdown</Text>
                </View>
              </View>
            )}
          </View>

          {/* Extra stats */}
          {hasData && (
            <View style={styles.extraRow}>
              <View style={styles.extraItem}>
                <Text style={styles.extraLabel}>Best win</Text>
                <Text style={[styles.extraVal, { color: colors.success }]}>+${biggestWin.toFixed(0)}</Text>
              </View>
              <View style={styles.extraItem}>
                <Text style={styles.extraLabel}>Worst loss</Text>
                <Text style={[styles.extraVal, { color: colors.error }]}>-${biggestLoss.toFixed(0)}</Text>
              </View>
            </View>
          )}

          {/* Live Match Monitoring (MVP) */}
          <View style={[styles.section, { marginTop: 24 }]}>
            <Text style={styles.sectionTitle}>Live Monitoring</Text>
            <View style={styles.liveCard}>
              {liveBets.length > 0 ? (
                <>
                  {liveBets.map((bet, i) => {
                    const bookUrl = getBookmakerUrl(bet.bookmaker);
                    const matched = matchBetToScore(bet);
                    return (
                      <View key={bet.id} style={[styles.liveBetRow, i < liveBets.length - 1 && { borderBottomWidth: 1, borderBottomColor: 'rgba(123, 168, 228, 0.1)' }]}>
                        <View style={[styles.livePulse, matched && { backgroundColor: colors.success }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.liveBetTitle} numberOfLines={1}>{bet.title}</Text>
                          {matched ? (
                            <Text style={styles.liveScoreDisplay}>
                              {matched.display}{matched.score.completed ? ' (Final)' : ''}
                            </Text>
                          ) : (
                            <Text style={styles.liveBetSub}>{bet.bookmaker} · @{bet.totalOdds} · ${bet.stake}</Text>
                          )}
                        </View>
                        <View style={styles.liveActions}>
                          {matched ? (
                            <View style={[styles.liveScoreBadge, { backgroundColor: matched.score.completed ? 'rgba(74, 222, 128, 0.12)' : 'rgba(249, 115, 22, 0.12)' }]}>
                              <Text style={[styles.liveScoreText, { color: matched.score.completed ? colors.success : '#F97316' }]}>
                                {matched.score.completed ? 'FINAL' : 'LIVE'}
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.liveScoreBadge}>
                              <Text style={styles.liveScoreText}>Live scores coming soon</Text>
                            </View>
                          )}
                          {bookUrl && (
                            <TouchableOpacity
                              style={styles.liveBookBtn}
                              onPress={() => Linking.openURL(bookUrl)}
                            >
                              <Ionicons name="open-outline" size={12} color={colors.accent} />
                              <Text style={styles.liveBookBtnText}>View on {bet.bookmaker}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })}
                  {pendingBets.length > 5 && (
                    <Text style={styles.liveMore}>+{pendingBets.length - 5} more pending</Text>
                  )}
                </>
              ) : (
                <View style={styles.chartEmpty}>
                  <Ionicons name="pulse-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.chartEmptyText}>No pending bets to monitor</Text>
                </View>
              )}
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  wrapper: { flex: 1 },
  scrollView: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },

  hero: {
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(176, 198, 228, 0.8)',
    letterSpacing: 1.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  animValue: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 13,
    color: colors.accent,
    marginTop: 5,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(27, 56, 102, 0.35)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.12)',
  },
  stat: { alignItems: 'center' },
  statVal: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 10, color: 'rgba(176, 198, 228, 0.6)', marginTop: 2, textTransform: 'uppercase' },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(176, 198, 228, 0.7)',
    marginBottom: 8,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  chartCard: {
    backgroundColor: 'rgba(27, 56, 102, 0.35)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.1)',
    minHeight: 130,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chartEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  chartEmptyText: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 8,
  },

  pieWrap: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  pieCenter: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pieLegend: {
    marginTop: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginHorizontal: 8, gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13, color: 'rgba(176, 198, 228, 0.9)', fontWeight: '500' },

  extraRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  extraItem: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(27, 56, 102, 0.35)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.1)',
  },
  extraLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 4 },
  extraVal: { fontSize: 15, fontWeight: '600' },

  // Bankroll stats below chart
  bankrollStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(123, 168, 228, 0.12)',
  },
  bankrollStatItem: { alignItems: 'center' },
  bankrollStatLabel: {
    fontSize: 10,
    color: 'rgba(176, 198, 228, 0.6)',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  bankrollStatValue: { fontSize: 14, fontWeight: '700' },

  // Insights
  insightsCard: {
    backgroundColor: 'rgba(27, 56, 102, 0.4)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.12)',
    gap: 10,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  insightText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },

  // ROI tables
  roiTable: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(123, 168, 228, 0.12)',
    gap: 6,
  },
  roiTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  roiTableName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  roiTableCount: {
    width: 50,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  roiTableRoi: {
    width: 60,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  roiTableProfit: {
    width: 60,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },

  // Portfolio: Sportsbook cards
  bookCard: {
    backgroundColor: 'rgba(27, 56, 102, 0.4)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.12)',
    marginBottom: 10,
  },
  bookHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  bookName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  bookRoiBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  bookRoiText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bookStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bookStatCol: { alignItems: 'center' },
  bookStatLabel: {
    fontSize: 10,
    color: 'rgba(176, 198, 228, 0.6)',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  bookStatVal: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // Live monitoring
  liveCard: {
    backgroundColor: 'rgba(27, 56, 102, 0.4)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.12)',
    minHeight: 120,
  },
  liveBetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  livePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.pending,
  },
  liveBetTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  liveBetSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  liveScoreDisplay: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F97316',
    marginTop: 2,
  },
  liveScoreBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveScoreText: {
    fontSize: 9,
    color: colors.pending,
    fontWeight: '600',
  },
  liveActions: {
    alignItems: 'flex-end',
    gap: 4,
  },
  liveBookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(123, 168, 228, 0.12)',
  },
  liveBookBtnText: {
    fontSize: 9,
    color: colors.accent,
    fontWeight: '600',
  },
  liveMore: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  lockedOverlay: {
    backgroundColor: 'rgba(22, 42, 78, 0.92)',
    borderRadius: 14,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.15)',
    gap: 8,
  },
  lockedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FBBF24',
    textAlign: 'center',
  },
});
