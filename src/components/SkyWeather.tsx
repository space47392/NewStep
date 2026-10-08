import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../constants/theme';
import { SkyWeather as Weather } from '../lib/sky';

// "Mood weather": the school's mood today shows up as weather in the sky.
//   tired → slow clouds, down → soft rain, excited → a meteor shower,
//   happy → fireflies, chill → a drifting aurora, nervous → flickering stars.

function seeded(n: number) {
  const x = Math.sin(n * 7919 + 104729) * 10000;
  return x - Math.floor(x);
}

function useLoop(duration: number, delay = 0) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t, duration, delay]);
  return t;
}

function Cloud({ i, width }: { i: number; width: number }) {
  const t = useLoop(38000 + i * 9000, i * 2500);
  const w = 110 + seeded(i) * 70;
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: `${14 + i * 15}%`,
        left: -w,
        opacity: 0.035 + seeded(i + 9) * 0.035,
        transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, width + w * 2] }) }],
      }}
    >
      <Svg width={w} height={w * 0.42} viewBox="0 0 100 42">
        <Path
          d="M14 38 C2 38 2 24 14 23 C14 12 30 8 38 16 C44 4 66 4 70 18 C84 14 96 24 88 34 C92 38 88 40 84 40 Z"
          fill={colors.sticker.lilac}
        />
      </Svg>
    </Animated.View>
  );
}

function RainDrop({ i, width, height }: { i: number; width: number; height: number }) {
  const t = useLoop(1300 + seeded(i) * 900, Math.floor(seeded(i + 3) * 1500));
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: -20,
        left: seeded(i + 7) * width,
        width: 1.2,
        height: 14,
        borderRadius: 1,
        backgroundColor: 'rgba(200,215,255,0.45)',
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.82] }) },
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
          { rotate: '8deg' },
        ],
      }}
    />
  );
}

function Meteor({ i, width }: { i: number; width: number }) {
  const t = useLoop(2600 + seeded(i) * 2600, Math.floor(seeded(i + 5) * 3000));
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: `${5 + seeded(i + 11) * 35}%`,
        left: width * (0.4 + seeded(i + 13) * 0.6),
        width: 60,
        height: 1.5,
        borderRadius: 1,
        backgroundColor: '#fff',
        opacity: t.interpolate({ inputRange: [0, 0.05, 0.3, 0.4, 1], outputRange: [0, 1, 0.6, 0, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, -width * 0.35, -width * 0.35] }) },
          { translateY: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, width * 0.18, width * 0.18] }) },
          { rotate: '-27deg' },
        ],
      }}
    />
  );
}

function Firefly({ i, width, height }: { i: number; width: number; height: number }) {
  const t = useLoop(5000 + seeded(i) * 4000, Math.floor(seeded(i + 2) * 2000));
  const x = seeded(i + 21) * width;
  const y = height * (0.4 + seeded(i + 31) * 0.4);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: colors.sticker.yellow,
        shadowColor: colors.sticker.yellow,
        opacity: t.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [0, 0.9, 0.5, 0] }),
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) },
          { translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 12, -6] }) },
        ],
      }}
    />
  );
}

function Aurora({ width, height }: { width: number; height: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: height * 0.08,
        left: -width * 0.1,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.6] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-20, 20] }) },
          { scaleY: t.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) },
        ],
      }}
    >
      <Svg width={width * 1.2} height={height * 0.35} viewBox="0 0 120 40" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="aurora" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.sticker.mint} stopOpacity={0} />
            <Stop offset="0.5" stopColor={colors.sticker.mint} stopOpacity={0.55} />
            <Stop offset="1" stopColor={colors.sticker.lilac} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d="M0 22 C20 6 40 30 60 14 C80 0 100 26 120 10 L120 34 C100 40 80 22 60 34 C40 44 20 24 0 36 Z" fill="url(#aurora)" />
      </Svg>
    </Animated.View>
  );
}

function Flicker({ i, width, height }: { i: number; width: number; height: number }) {
  const t = useLoop(500 + seeded(i) * 500, Math.floor(seeded(i + 4) * 800));
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: seeded(i + 41) * width,
        top: seeded(i + 51) * height * 0.7,
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: '#fff',
        opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.1, 0.9, 0.1] }),
      }}
    />
  );
}

export default function SkyWeather({ kind }: { kind: Weather | null }) {
  const { width, height } = useWindowDimensions();
  const items = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  if (!kind) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {kind === 'clouds' && items.slice(0, 4).map((i) => <Cloud key={i} i={i} width={width} />)}
      {kind === 'rain' && items.map((i) => <RainDrop key={i} i={i} width={width} height={height} />)}
      {kind === 'meteors' && items.slice(0, 6).map((i) => <Meteor key={i} i={i} width={width} />)}
      {kind === 'fireflies' && items.slice(0, 14).map((i) => <Firefly key={i} i={i} width={width} height={height} />)}
      {kind === 'aurora' && <Aurora width={width} height={height} />}
      {kind === 'flicker' && items.slice(0, 18).map((i) => <Flicker key={i} i={i} width={width} height={height} />)}
    </View>
  );
}
