import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, radius } from '../constants/theme';

// The app icon's starry night, as a card: navy glow with little four-point
// sparkles that slowly twinkle. Content sits on top; use light text.

type Star = { x: number; y: number; size: number; color: string; delay: number };

// Positions as fractions of the card, kept to the edges so text stays clear.
const STARS: Star[] = [
  { x: 0.9, y: 0.16, size: 14, color: colors.sticker.yellow, delay: 0 },
  { x: 0.78, y: 0.62, size: 9, color: '#8FE6FF', delay: 700 },
  { x: 0.96, y: 0.82, size: 7, color: colors.sticker.pink, delay: 1400 },
  { x: 0.62, y: 0.12, size: 6, color: '#FFFFFF', delay: 1000 },
  { x: 0.04, y: 0.88, size: 8, color: colors.sticker.lilac, delay: 300 },
  { x: 0.5, y: 0.9, size: 5, color: '#FFFFFF', delay: 1800 },
];

// Tiny static dots for depth.
const DUST = [
  [0.7, 0.3], [0.85, 0.45], [0.55, 0.28], [0.3, 0.92], [0.97, 0.4], [0.68, 0.85], [0.42, 0.08],
];

const SPARKLE = 'M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z';

function Twinkle({ star }: { star: Star }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(star.delay),
        Animated.timing(t, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t, star.delay]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${star.x * 100}%`,
        top: `${star.y * 100}%`,
        marginLeft: -star.size / 2,
        marginTop: -star.size / 2,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.1] }) }],
      }}
    >
      <Svg width={star.size} height={star.size} viewBox="0 0 24 24">
        <Path d={SPARKLE} fill={star.color} />
      </Svg>
    </Animated.View>
  );
}

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
};

export default function NightSkyCard({ children, style, onLayout }: Props) {
  const dust = useMemo(
    () =>
      DUST.map(([x, y], i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[styles.dust, { left: `${x * 100}%`, top: `${y * 100}%` }]}
        />
      )),
    []
  );

  return (
    <View style={[styles.card, style]} onLayout={onLayout}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="glow" cx="78%" cy="20%" r="90%">
            <Stop offset="0" stopColor="#3A2F95" />
            <Stop offset="0.55" stopColor={colors.night} />
            <Stop offset="1" stopColor="#120E3A" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#glow)" />
      </Svg>
      {dust}
      {STARS.map((s, i) => (
        <Twinkle key={i} star={s} />
      ))}
      <View>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.night,
  },
  dust: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
