import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions, Animated, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/colors';

const { width, height } = Dimensions.get('window');

const rand = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

interface Star {
  x: number;
  y: number;
  size: number;
  baseOpacity: number;
  twinkle: boolean;
  color?: string;
}

const generateBackgroundStars = (): Star[] => {
  const stars: Star[] = [];
  const count = 35;
  for (let i = 0; i < count; i++) {
    const r = rand(i * 11 + 3);
    stars.push({
      x: rand(i * 13) * width,
      y: rand(i * 17) * height,
      size: r < 0.85 ? (0.6 + rand(i * 21) * 0.4) : 1.2,
      baseOpacity: 0.15 + rand(i * 19) * 0.35,
      twinkle: r > 0.6,
      color: 'rgba(210, 230, 255, 1)',
    });
  }
  return stars;
};

const generateMilkyWayStars = (): Star[] => {
  const stars: Star[] = [];
  const numBandStars = 80;

  const diagLength = Math.sqrt(width * width + height * height) || 1000;
  const dirX = (width || 800) / diagLength;
  const dirY = (height || 600) / diagLength;

  const perpX = -dirY;
  const perpY = dirX;

  for (let i = 0; i < numBandStars; i++) {
    const t = rand(i * 101);
    const lengthPos = -diagLength * 0.2 + t * (diagLength * 1.4);

    const spreadNorm = (rand(i * 103) + rand(i * 107) + rand(i * 109)) / 3 - 0.5;
    const currentBandWidth = 160 + Math.sin(t * Math.PI) * 80;
    const spreadDistance = spreadNorm * currentBandWidth;

    const x = (dirX * lengthPos) + (perpX * spreadDistance);
    const y = (dirY * lengthPos) + (perpY * spreadDistance);

    const r = rand(i * 113);
    const starColor = r < 0.5
      ? 'rgba(220, 235, 255, 1)'
      : r < 0.8
        ? 'rgba(190, 215, 245, 1)'
        : 'rgba(245, 230, 240, 1)';

    stars.push({
      x,
      y,
      size: r < 0.9 ? (0.4 + rand(i * 127) * 0.5) : (1.0 + rand(i * 127) * 0.4),
      baseOpacity: 0.08 + rand(i * 131) * 0.3,
      twinkle: r > 0.5,
      color: starColor,
    });
  }
  return stars;
};

function TwinklingStar({ star }: { star: Star }) {
  const opacity = useRef(new Animated.Value(star.baseOpacity)).current;

  useEffect(() => {
    if (star.twinkle) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: Math.min(star.baseOpacity + 0.25, 0.7),
            duration: 1500 + rand(star.x) * 2500,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(opacity, {
            toValue: Math.max(star.baseOpacity * 0.3, 0.04),
            duration: 2000 + rand(star.y) * 2500,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.delay(rand(star.x + star.y) * 2000),
        ])
      ).start();
    }
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: star.x,
        top: star.y,
        width: star.size * 2,
        height: star.size * 2,
        borderRadius: star.size,
        backgroundColor: star.color,
        opacity,
      }}
    />
  );
}

export default function AppBackground() {
  const stars = useMemo(() => [...generateBackgroundStars(), ...generateMilkyWayStars()], []);

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <LinearGradient
        colors={['#0E2247', colors.background, '#060E1F']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      {stars.map((star, i) => (
        <TwinklingStar key={i} star={star} />
      ))}
    </View>
  );
}
