import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, View, useAnimatedValue } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

// The Lanterns backdrop: a warm evening (plum fading into ember) with a few
// far-off lanterns drifting up. Calm and cozy rather than cold night.

const FAR_LANTERNS = [
  { x: 0.12, y: 0.62, size: 7, delay: 0 },
  { x: 0.82, y: 0.48, size: 9, delay: 1600 },
  { x: 0.58, y: 0.74, size: 6, delay: 800 },
  { x: 0.3, y: 0.36, size: 5, delay: 2400 },
  { x: 0.92, y: 0.8, size: 6, delay: 3200 },
];

function FarLantern({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const t = useAnimatedValue(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t, delay]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.85] }),
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) }],
      }}
    >
      <View style={{ position: 'absolute', width: size * 4, height: size * 4, borderRadius: size * 2, backgroundColor: 'rgba(255,170,90,0.14)' }} />
      <View style={{ width: size, height: size * 1.25, borderRadius: size * 0.3, backgroundColor: '#FFB46E' }} />
    </Animated.View>
  );
}

export default function LanternBackdrop() {
  return (
    <View style={styles.fill} pointerEvents="none">
      <Svg style={styles.fill} preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="eve" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1B1426" />
            <Stop offset="0.55" stopColor="#2A1A2C" />
            <Stop offset="1" stopColor="#3D2226" />
          </LinearGradient>
          <RadialGradient id="ember" cx="50%" cy="100%" r="70%">
            <Stop offset="0" stopColor="#FF9A5A" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#FF9A5A" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#eve)" />
        <Rect x="0" y="0" width="100" height="100" fill="url(#ember)" />
      </Svg>
      {FAR_LANTERNS.map((l, i) => (
        <FarLantern key={i} {...l} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
