import { useEffect, useMemo } from 'react';
import { View, Animated, Easing, StyleSheet, useWindowDimensions, useAnimatedValue } from 'react-native';
import { colors } from '../constants/theme';

type Props = {
  // Change this (e.g. Date.now()) to fire a new burst; 0 means "never fired".
  trigger: number;
};

const PIECES = 36;
const DURATION = 1600;
const PIECE_COLORS = [colors.primary, colors.secondary, colors.accent, colors.warning, colors.primaryLight];

// Small seeded PRNG (mulberry32): the same trigger always gives the same
// layout, so render stays pure while each new burst still looks different.
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A one-shot confetti pop from the upper middle of the screen — little
// squares and dots fly out, fall with a bit of gravity, spin and fade.
// Purely decorative: never intercepts touches.
export default function ConfettiBurst({ trigger }: Props) {
  const { width, height } = useWindowDimensions();
  const progress = useAnimatedValue(0);

  // One fixed layout per burst, so pieces don't jump between renders.
  const pieces = useMemo(() => {
    const random = seededRandom(trigger);
    return Array.from({ length: PIECES }, (_, i) => {
      const angle = (Math.PI * 2 * i) / PIECES + (random() - 0.5) * 0.4;
      const speed = 110 + random() * 140;
      return {
        dx: Math.cos(angle) * speed,
        // Biased upward first, then gravity pulls everything down.
        dy: Math.sin(angle) * speed - 120,
        fall: 260 + random() * 200,
        spin: (random() > 0.5 ? 1 : -1) * (360 + random() * 360),
        size: 6 + random() * 6,
        round: random() > 0.6,
        color: PIECE_COLORS[i % PIECE_COLORS.length],
      };
    });
  }, [trigger]);

  useEffect(() => {
    if (!trigger) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [trigger, progress]);

  if (!trigger) return null;

  const originX = width / 2;
  const originY = height * 0.38;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        // Burst out fast (ease-out over the first 35%), then drift/fall.
        const translateX = progress.interpolate({
          inputRange: [0, 0.35, 1],
          outputRange: [0, p.dx, p.dx * 1.25],
        });
        const translateY = progress.interpolate({
          inputRange: [0, 0.35, 1],
          outputRange: [0, p.dy, p.dy + p.fall],
        });
        const rotate = progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${p.spin}deg`],
        });
        const opacity = progress.interpolate({
          inputRange: [0, 0.05, 0.7, 1],
          outputRange: [0, 1, 1, 0],
        });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: originX,
              top: originY,
              width: p.size,
              height: p.round ? p.size : p.size * 0.6,
              borderRadius: p.round ? p.size / 2 : 1,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateX }, { translateY }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}
