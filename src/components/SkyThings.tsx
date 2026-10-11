import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { SkyThing } from '../lib/sky';

// What classmates said they saw today, drawn into the School Sky: a soft
// rainbow, birds drifting past, a blinking plane, fog, snow, a lightning
// flash. Rain and shooting stars are handled by the mood-weather layer.

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

function Rainbow({ width, height }: { width: number; height: number }) {
  const w = width * 1.3;
  const h = height * 0.5;
  return (
    <View style={{ position: 'absolute', left: -width * 0.15, top: height * 0.32, opacity: 0.42 }} pointerEvents="none">
      <Svg width={w} height={h} viewBox="0 0 100 50">
        {['#ff6b6b', '#ffb36b', '#ffe66b', '#7ee08a', '#6bc4ff', '#8a7bff', '#c58aff'].map((c, i) => (
          <Path key={c} d={`M${4 + i * 1.6} 50 A${46 - i * 1.6} ${46 - i * 1.6} 0 0 1 ${96 - i * 1.6} 50`} stroke={c} strokeWidth={1.7} fill="none" />
        ))}
      </Svg>
    </View>
  );
}

function Bird({ i, width, height }: { i: number; width: number; height: number }) {
  const t = useLoop(16000 + i * 2500, i * 1800);
  const flap = useLoop(700 + i * 90);
  const top = height * (0.28 + i * 0.05);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top,
        left: -30,
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, width + 60] }) },
          { translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -20, 6] }) },
          { scaleY: flap.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.45, 1] }) },
        ],
      }}
    >
      <Svg width={18 - i * 2} height={8} viewBox="0 0 18 8">
        <Path d="M0 2 Q4.5 0 9 6 Q13.5 0 18 2" stroke="#15122e" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

function Airplane({ width, height }: { width: number; height: number }) {
  const t = useLoop(40000, 3000);
  const blink = useLoop(1200);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: height * 0.18,
        left: width + 10,
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, -width - 40] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.06] }) },
        ],
      }}
    >
      <Animated.View
        style={[styles.planeLight, { opacity: blink.interpolate({ inputRange: [0, 0.1, 0.2, 1], outputRange: [1, 0.2, 1, 0.25] }) }]}
      />
      <View style={styles.contrail} />
    </Animated.View>
  );
}

function Snowflake({ i, width, height }: { i: number; width: number; height: number }) {
  const t = useLoop(7000 + ((i * 937) % 4000), (i * 523) % 5000);
  const x = ((i * 211) % 100) / 100;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -10,
        left: x * width,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.85)',
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.85] }) },
          { translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 14, -6] }) },
        ],
      }}
    />
  );
}

function Fog({ width, height }: { width: number; height: number }) {
  const t = useLoop(30000);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -width * 0.3,
        bottom: height * 0.12,
        transform: [{ translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, width * 0.15, 0] }) }],
      }}
    >
      <Svg width={width * 1.6} height={height * 0.3} viewBox="0 0 100 30" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#E8E6F5" stopOpacity={0} />
            <Stop offset="0.6" stopColor="#E8E6F5" stopOpacity={0.28} />
            <Stop offset="1" stopColor="#E8E6F5" stopOpacity={0.12} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="30" fill="url(#fog)" />
      </Svg>
    </Animated.View>
  );
}

function Lightning() {
  const t = useLoop(9000, 2500);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: '#ffffff',
          opacity: t.interpolate({ inputRange: [0, 0.9, 0.91, 0.93, 0.94, 0.96, 1], outputRange: [0, 0, 0.35, 0.05, 0.25, 0, 0] }),
        },
      ]}
    />
  );
}

function ExtraStars({ width, height }: { width: number; height: number }) {
  const t = useLoop(3000);
  const dots = useMemo(
    () => Array.from({ length: 40 }, (_, i) => ({ x: ((i * 397) % 1000) / 1000, y: ((i * 613) % 550) / 1000 })),
    []
  );
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1, 0.6] }) }]}
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="xs" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#fff" stopOpacity={1} />
            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {dots.map((d, i) => (
          <Rect key={i} x={d.x * width} y={d.y * height} width={3} height={3} rx={1.5} fill="url(#xs)" />
        ))}
      </Svg>
    </Animated.View>
  );
}

export default function SkyThings({ things }: { things: SkyThing[] }) {
  const { width, height } = useWindowDimensions();
  if (things.length === 0) return null;
  const has = (t: SkyThing) => things.includes(t);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {has('stars') ? <ExtraStars width={width} height={height} /> : null}
      {has('rainbow') ? <Rainbow width={width} height={height} /> : null}
      {has('fog') ? <Fog width={width} height={height} /> : null}
      {has('birds') ? [0, 1, 2].map((i) => <Bird key={i} i={i} width={width} height={height} />) : null}
      {has('airplane') ? <Airplane width={width} height={height} /> : null}
      {has('snow') ? Array.from({ length: 28 }, (_, i) => <Snowflake key={i} i={i} width={width} height={height} />) : null}
      {has('lightning') ? <Lightning /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  planeLight: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ff6b6b',
  },
  contrail: {
    position: 'absolute',
    left: 4,
    top: 1,
    width: 70,
    height: 1.2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
});
