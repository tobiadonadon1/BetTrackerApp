import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, BarChart, PieChart } from 'react-native-gifted-charts';
import { colors } from '../constants/colors';
import { useBets } from '../hooks';
import { Bet } from '../types';
import AppBackground from '../components/AppBackground';
import PageHeader from '../components/PageHeader';

const CHART_WIDTH = Dimensions.get('window').width - 48;

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

export default function StatsScreen() {
  const { bets } = useBets();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
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

  const categoryStats: Record<string, { count: number; wins: number }> = {};
  bets.forEach(bet => {
    if (!categoryStats[bet.category]) categoryStats[bet.category] = { count: 0, wins: 0 };
    categoryStats[bet.category].count++;
    if (bet.status === 'won') categoryStats[bet.category].wins++;
  });

  const profitData = getProfitOverTime(bets);
  const perfData = [
    { value: wonBets.length, label: 'W', frontColor: colors.success },
    { value: lostBets.length, label: 'L', frontColor: colors.error },
    { value: pendingBets.length, label: 'P', frontColor: colors.pending },
  ].filter(d => d.value > 0);

  const pieData = Object.entries(categoryStats)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 6)
    .map(([cat, s], i) => ({
      value: s.count,
      color: [colors.success, colors.accent, colors.pending, '#A78BFA', '#F472B6', '#34D399'][i % 6],
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
              <Text style={styles.statVal}>{avgOdds}×</Text>
              <Text style={styles.statLabel}>Avg odds</Text>
            </View>
          </View>

          {/* Profit over time — line chart */}
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

          {/* Performance — horizontal bar */}
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
  content: { padding: 20, paddingBottom: 24 },

  hero: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 8,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(176, 198, 228, 0.75)',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  animValue: {
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 13,
    color: colors.accent,
    marginTop: 4,
    fontWeight: '500',
  },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(27, 56, 102, 0.4)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.15)',
  },
  stat: { alignItems: 'center' },
  statVal: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  statLabel: { fontSize: 11, color: 'rgba(176, 198, 228, 0.7)', marginTop: 2 },

  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(176, 198, 228, 0.9)',
    marginBottom: 10,
    letterSpacing: 0.3,
  },

  chartCard: {
    backgroundColor: 'rgba(27, 56, 102, 0.4)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(123, 168, 228, 0.12)',
    minHeight: 140,
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
});
