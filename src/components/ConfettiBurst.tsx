import { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import { colors } from '../constants/theme';

type Props = {
  // Change this (e.g. Date.now()) to fire a new burst; 0 means "never fired".
  trigger: number;
};

const PIECES = 36;
const DURATION = 1600;
const PIECE_COLORS = [colors.primary, colors.secondary, colors.accent, colors.warning, colors.primaryLight];

// A one-shot confetti pop from the upper middle of the screen — little
// squares and dots fly out, fall with a bit of gravity, spin and fade.
// Purely decorative: never intercepts touches.
export default function ConfettiBurst({ trigger }: Props) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;

  // Fixed random layout per burst, so pieces don't jump between renders.
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => {
        const angle = (Math.PI * 2 * i) / PIECES + (Math.random() - 0.5) * 0.4;
        const speed = 110 + Math.random() * 140;
        return {
          dx: Math.cos(angle) * speed,
          // Biased upward first, then gravity pulls everything down.
          dy: Math.sin(angle) * speed - 120,
          fall: 260 + Math.random() * 200,
          spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360),
          size: 6 + Math.random() * 6,
          round: Math.random() > 0.6,
          color: PIECE_COLORS[i % PIECE_COLORS.length],
        };
      }),
    // New random layout on every new trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trigger]
  );

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
