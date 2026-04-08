/**
 * OverUnderProgressBar.tsx
 *
 * A PrizePicks-inspired horizontal progress bar for Over/Under bets.
 * Green = currently winning, Red = currently losing.
 * Shows: current value, threshold marker, stat label, direction label.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import { OverUnderDirection, statTypeLabel, StatType } from '../utils/overUnderParser';

interface OverUnderProgressBarProps {
  currentValue: number;
  threshold: number;
  direction: OverUnderDirection;
  statType: StatType;
  isLive: boolean;
}

export default function OverUnderProgressBar({
  currentValue,
  threshold,
  direction,
  statType,
  isLive,
}: OverUnderProgressBarProps) {
  // Calculate progress: how far along toward (or past) the threshold
  const maxDisplay = Math.max(threshold * 1.5, currentValue + 1, threshold + 2);
  const fillPercent = Math.min((currentValue / maxDisplay) * 100, 100);
  const thresholdPercent = Math.min((threshold / maxDisplay) * 100, 100);

  // Determine if currently winning
  const isWinning =
    direction === 'over'
      ? currentValue > threshold
      : currentValue < threshold;

  const barColor = isWinning ? colors.success : colors.error;
  const directionLabel = direction === 'over' ? 'MORE' : 'LESS';
  const label = statTypeLabel(statType);

  if (!isLive) return null;

  return (
    <View style={styles.container}>
      {/* Direction + Stat Label Row */}
      <View style={styles.topRow}>
        <View style={[styles.directionBadge, { backgroundColor: isWinning ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)' }]}>
          <Text style={[styles.directionText, { color: barColor }]}>{directionLabel}</Text>
        </View>
        <View style={styles.thresholdValueContainer}>
          <Text style={[styles.thresholdValueLarge, { color: isWinning ? colors.success : colors.error }]}>
            {threshold % 1 === 0 ? threshold.toFixed(1) : threshold}
          </Text>
          {label ? <Text style={styles.statLabel}>{label}</Text> : null}
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.barTrack}>
        {/* Fill */}
        <View
          style={[
            styles.barFill,
            {
              width: `${fillPercent}%`,
              backgroundColor: barColor,
            },
          ]}
        />

        {/* Threshold Marker (dashed vertical line) */}
        <View style={[styles.thresholdMarker, { left: `${thresholdPercent}%` }]}>
          <View style={styles.thresholdDash} />
          <View style={styles.thresholdDash} />
          <View style={styles.thresholdDash} />
        </View>
      </View>

      {/* Bottom row: current value and threshold label */}
      <View style={styles.bottomRow}>
        <Text style={[styles.currentValue, { color: barColor }]}>
          {currentValue % 1 === 0 ? currentValue.toFixed(1) : currentValue}
        </Text>
        <Text style={styles.thresholdLabel}>
          {threshold}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  directionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  directionText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  thresholdValueContainer: {
    alignItems: 'flex-end',
  },
  thresholdValueLarge: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginTop: 1,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'visible',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 4,
  },
  thresholdMarker: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: -1,
  },
  thresholdDash: {
    width: 2,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  currentValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  thresholdLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
