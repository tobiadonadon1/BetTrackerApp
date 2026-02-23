import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions, Animated } from 'react-native';
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
  speed: number;
  driftX: number;
  driftY: number;
}

const generateStarfield = (): Star[] => {
  const stars: Star[] = [];
  for (let i = 0; i < 60; i++) {
    const r = rand(i * 7 + 3);
    stars.push({
      x: rand(i * 7) * width,
      y: rand(i * 7 + 1) * height,
      size: r < 0.7 ? 1 : r < 0.92 ? 1.5 : 2,
      baseOpacity: 0.3 + rand(i * 7 + 2) * 0.5,
      twinkle: r > 0.6,
      speed: 8000 + rand(i * 7 + 4) * 16000,
      driftX: (rand(i * 7 + 5) - 0.5) * 30,
      driftY: (rand(i * 7 + 6) - 0.5) * 20,
    });
  }
  return stars;
};

function TwinklingStar({ star }: { star: Star }) {
  const opacity = useRef(new Animated.Value(star.baseOpacity)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (star.twinkle) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: Math.min(star.baseOpacity + 0.5, 1),
            duration: 800 + rand(star.x) * 1200,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: star.baseOpacity * 0.4,
            duration: 1000 + rand(star.y) * 1500,
            useNativeDriver: true,
          }),
          Animated.delay(rand(star.x + star.y) * 3000),
        ])
      ).start();
    }

    Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: star.driftX,
          duration: star.speed,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: -star.driftX * 0.6,
          duration: star.speed * 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: star.speed * 0.5,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: star.driftY,
          duration: star.speed * 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -star.driftY * 0.7,
          duration: star.speed * 0.7,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: star.speed * 0.6,
          useNativeDriver: true,
        }),
      ])
    ).start();
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
        backgroundColor: 'rgba(200, 220, 255, 1)',
        opacity,
        transform: [{ translateX }, { translateY }],
      }}
    />
  );
}

function LightRay({ angle, x, delay }: { angle: number; x: number; delay: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0.12,
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(translateX, {
            toValue: 20,
            duration: 6000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(translateX, {
            toValue: -20,
            duration: 6000,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(2000),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: -height * 0.1,
        width: 2,
        height: height * 1.4,
        opacity,
        transform: [
          { rotate: `${angle}deg` },
          { translateX },
        ],
      }}
    >
      <LinearGradient
        colors={[
          'transparent',
          'rgba(135, 206, 235, 0.4)',
          'rgba(135, 206, 235, 0.15)',
          'transparent',
        ]}
        style={{ flex: 1, width: 2 }}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
    </Animated.View>
  );
}

export default function AppBackground() {
  const stars = useMemo(() => generateStarfield(), []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Dark gradient base */}
      <LinearGradient
        colors={[colors.background, '#091526', '#060e1c']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Subtle light rays */}
      <LightRay angle={25} x={width * 0.3} delay={0} />
      <LightRay angle={-18} x={width * 0.7} delay={3000} />
      <LightRay angle={12} x={width * 0.5} delay={6000} />

      {/* Twinkling stars */}
      {stars.map((star, i) => (
        <TwinklingStar key={i} star={star} />
      ))}
    </View>
  );
}
