import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, Dimensions, TouchableOpacity, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, BarChart, PieChart } from 'react-native-gifted-charts';
import { colors } from '../constants/colors';
import { useBets, useBankroll, useLiveScores } from '../hooks';
import { Bet } from '../types';
import AppBackground from '../components/AppBackground';
import PageHeader from '../components/PageHeader';

const CHART_WIDTH = Dimensions.get('window').width - 48;
const CHART_COLORS = [colors.success, colors.accent, colors.pending, '#A78BFA', '#F472B6', '#34D399', '#FB923C', '#38BDF8'];

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
  bets.forEach(b => {
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
  const { bets } = useBets();
  const { isConfigured, currentBalance, settings: bankrollSettings, history: bankrollHistory, changePercent, unitSize1Pct, unitSize2Pct } = useBankroll();
  const { matchBetToScore } = useLiveScores();
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

  const winRate = totalBets > 0 ? Math.round((wonBets.length / totalBets) * 100) : 0;
  const totalWagered = bets.reduce((sum, b) => sum + b.stake, 0);
  const totalWon = wonBets.reduce((sum, b) => sum + b.stake * b.totalOdds, 0);
  const netProfit = totalWon - totalWagered;
  const roi = totalWagered > 0 ? ((netProfit / totalWagered) * 100).toFixed(1) : '0.0';

  const profitData = getProfitOverTime(bets);
  const perfData = [
    { value: wonBets.length, label: 'W', frontColor: colors.success },
    { value: lostBets.length, label: 'L', frontColor: colors.error },
    { value: pendingBets.length, label: 'P', frontColor: colors.pending },
  ].filter(d => d.value > 0);

  const categoryStats: Record<string, { count: number; wins: number }> = {};
  bets.forEach(bet => {
    if (!categoryStats[bet.category]) categoryStats[bet.category] = { count: 0, wins: 0 };
    categoryStats[bet.category].count++;
    if (bet.status === 'won') categoryStats[bet.category].wins++;
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
  const sportStats = computeGroupedStats(bets, b => b.category);
  const sportBarData = sportStats.slice(0, 6).map((s, i) => ({
    value: Math.abs(s.roi),
    label: s.key.slice(0, 4),
    frontColor: s.roi >= 0 ? colors.success : colors.error,
  }));

  // --- ROI per Bet Type ---
  const betTypeStats = computeGroupedStats(bets, b => b.betType || 'single');
  const betTypeBarData = betTypeStats.map((s, i) => ({
    value: Math.abs(s.roi),
    label: s.key.slice(0, 5),
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
        label: s.key.slice(0, 5),
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
      <PageHeader title="Statistics" />

      <Animated.View style={[styles.wrapper, { opacity: fadeAnim }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Net Profit</Text>
            <AnimatedValue
              value={Math.abs(netProfit)}
              prefix={netProfit >= 0 ? '+$' : '-$'}
              color={netProfit >= 0 ? colors.success : colors.error}
            />
            <Text style={styles.heroSub}>ROI {roi}%</Text>
          </View>

          {/* Compact stats row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{totalBets}</Text>
              <Text style={styles.statLabel}>Bets</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: colors.success }]}>{winRate}%</Text>
              <Text style={styles.statLabel}>Win</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>${totalWagered.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Wagered</Text>
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
              <View style={styles.insightsCard}>
                {insights.map((ins, i) => (
                  <View key={i} style={styles.insightRow}>
                    <Ionicons name={ins.icon} size={16} color={ins.color} />
                    <Text style={[styles.insightText, { color: ins.color }]}>{ins.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Bankroll Curve */}
          {isConfigured && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Bankroll Curve</Text>
              <View style={styles.chartCard}>
                {bankrollCurveData.length > 1 ? (
                  <>
                    <LineChart
                      data={bankrollCurveData}
                      width={CHART_WIDTH}
                      height={140}
                      spacing={bankrollCurveData.length > 5 ? 40 : 60}
                      initialSpacing={16}
                      endSpacing={16}
                      color={changePercent >= 0 ? colors.success : colors.error}
                      thickness={2}
                      hideDataPoints={bankrollCurveData.length > 10}
                      dataPointsColor={colors.accent}
                      startFillColor={changePercent >= 0 ? colors.success + '40' : colors.error + '40'}
                      endFillColor={changePercent >= 0 ? colors.success + '08' : colors.error + '08'}
                      areaChart
                      isAnimated
                      animationDuration={800}
                      yAxisColor="transparent"
                      xAxisColor="rgba(255,255,255,0.12)"
                      hideRules
                      hideYAxisText
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

          {/* Profit over time */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profit over time</Text>
            <View style={styles.chartCard}>
              {profitData.length > 1 ? (
                <LineChart
                  data={profitData}
                  width={CHART_WIDTH}
                  height={140}
                  spacing={profitData.length > 5 ? 40 : 60}
                  initialSpacing={16}
                  endSpacing={16}
                  color={netProfit >= 0 ? colors.success : colors.error}
                  thickness={2}
                  hideDataPoints={profitData.length > 10}
                  dataPointsColor={colors.accent}
                  startFillColor={netProfit >= 0 ? colors.success + '40' : colors.error + '40'}
                  endFillColor={netProfit >= 0 ? colors.success + '08' : colors.error + '08'}
                  areaChart
                  isAnimated
                  animationDuration={800}
                  yAxisColor="transparent"
                  xAxisColor="rgba(255,255,255,0.12)"
                  hideRules
                  hideYAxisText
                />
              ) : (
                <View style={styles.chartEmpty}>
                  <Ionicons name="trending-up-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.chartEmptyText}>Add settled bets to see profit trend</Text>
                </View>
              )}
            </View>
          </View>

          {/* ROI per Sport */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ROI per Sport</Text>
            <View style={styles.chartCard}>
              {sportBarData.length > 0 ? (
                <>
                  <BarChart
                    data={sportBarData}
                    width={CHART_WIDTH}
                    barWidth={28}
                    spacing={20}
                    initialSpacing={12}
                    isAnimated
                    animationDuration={600}
                    hideRules
                    xAxisThickness={0}
                    yAxisThickness={0}
                    noOfSections={3}
                    maxValue={Math.max(...sportBarData.map(d => d.value), 10) * 1.2}
                    barBorderRadius={4}
                  />
                  {/* Table below */}
                  <View style={styles.roiTable}>
                    {sportStats.slice(0, 6).map((s, i) => (
                      <View key={s.key} style={styles.roiTableRow}>
                        <Text style={styles.roiTableName} numberOfLines={1}>{s.key}</Text>
                        <Text style={styles.roiTableCount}>{s.count}</Text>
                        <Text style={[styles.roiTableRoi, { color: s.roi >= 0 ? colors.success : colors.error }]}>
                          {s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%
                        </Text>
                        <Text style={[styles.roiTableProfit, { color: s.profit >= 0 ? colors.success : colors.error }]}>
                          {s.profit >= 0 ? '+' : ''}${s.profit.toFixed(0)}
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
          </View>

          {/* ROI per Bet Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ROI per Bet Type</Text>
            <View style={styles.chartCard}>
              {betTypeBarData.length > 0 ? (
                <>
                  <BarChart
                    data={betTypeBarData}
                    width={CHART_WIDTH}
                    barWidth={36}
                    spacing={28}
                    initialSpacing={12}
                    isAnimated
                    animationDuration={600}
                    hideRules
                    xAxisThickness={0}
                    yAxisThickness={0}
                    noOfSections={3}
                    maxValue={Math.max(...betTypeBarData.map(d => d.value), 10) * 1.2}
                    barBorderRadius={4}
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
                          {s.profit >= 0 ? '+' : ''}${s.profit.toFixed(0)}
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

          {/* ROI per League */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ROI per League</Text>
            <View style={styles.chartCard}>
              {hasRealLeagues && leagueBarData.length > 0 ? (
                <>
                  <BarChart
                    data={leagueBarData}
                    width={CHART_WIDTH}
                    barWidth={28}
                    spacing={20}
                    initialSpacing={12}
                    isAnimated
                    animationDuration={600}
                    hideRules
                    xAxisThickness={0}
                    yAxisThickness={0}
                    noOfSections={3}
                    maxValue={Math.max(...leagueBarData.map(d => d.value), 10) * 1.2}
                    barBorderRadius={4}
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
                          {s.profit >= 0 ? '+' : ''}${s.profit.toFixed(0)}
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

          {/* W / L / P */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>W / L / P</Text>
            <View style={styles.chartCard}>
              {perfData.length > 0 ? (
                <BarChart
                  data={perfData}
                  horizontal
                  width={CHART_WIDTH}
                  barWidth={22}
                  spacing={24}
                  initialSpacing={12}
                  isAnimated
                  animationDuration={600}
                  hideRules
                  xAxisThickness={0}
                  yAxisThickness={0}
                  noOfSections={2}
                  maxValue={Math.max(...perfData.map(d => d.value), 1) * 1.2}
                />
              ) : (
                <View style={styles.chartEmpty}>
                  <Text style={styles.chartEmptyText}>No settled bets yet</Text>
                </View>
              )}
            </View>
          </View>

          {/* By category — donut */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>By category</Text>
            <View style={styles.chartCard}>
              {pieData.length > 0 ? (
                <View style={styles.pieWrap}>
                  <PieChart
                    data={pieData}
                    donut
                    radius={70}
                    innerRadius={44}
                    innerCircleColor="rgba(11, 27, 61, 0.9)"
                    isAnimated
                    animationDuration={700}
                    centerLabelComponent={() => (
                      <Text style={styles.pieCenter}>{totalBets}</Text>
                    )}
                  />
                  <View style={styles.pieLegend}>
                    {pieData.slice(0, 4).map((d, i) => (
                      <View key={i} style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                        <Text style={styles.legendText}>{d.text} ({d.value})</Text>
                      </View>
                    ))}
                  </View>
                </View>
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
                        {book.profit >= 0 ? '+' : ''}${book.profit.toFixed(0)}
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
          <View style={styles.section}>
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
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.1)',
    minHeight: 130,
    justifyContent: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  pieCenter: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pieLegend: { marginLeft: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: 'rgba(176, 198, 228, 0.9)' },

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
});
