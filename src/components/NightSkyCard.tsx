import { ReactNode, useEffect, useMemo } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle, useAnimatedValue } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, radius } from '../constants/theme';
import { TodaySky } from '../lib/sky';
import { brightness } from '../lib/skyColors';

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
  const t = useAnimatedValue(0);
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
  // Today's school sky as classmates described it (School Sky). When set,
  // the card shows that sky instead of the default night.
  sky?: TodaySky | null;
};

// A couple of soft clouds for the header when the described sky had them.
function HeaderCloud({ x, y, w, color }: { x: number; y: number; w: number; color: string }) {
  const t = useAnimatedValue(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 30000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 30000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        opacity: 0.7,
        transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-12, 12] }) }],
      }}
    >
      <Svg width={w} height={w * 0.36} viewBox="0 0 100 36">
        <Defs>
          <RadialGradient id={`hc${x}`} cx="50%" cy="55%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.95} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="30" cy="22" r="15" fill={`url(#hc${x})`} />
        <Circle cx="52" cy="16" r="18" fill={`url(#hc${x})`} />
        <Circle cx="72" cy="22" r="15" fill={`url(#hc${x})`} />
      </Svg>
    </Animated.View>
  );
}

export default function NightSkyCard({ children, style, onLayout, sky }: Props) {
  // Fade the described sky in over the night.
  const fade = useAnimatedValue(0);
  const skyKey = sky ? sky.colors.join(',') : '';
  useEffect(() => {
    if (!skyKey) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
  }, [skyKey, fade]);
  const darkSky = !sky || brightness(sky.colors[0]) < 0.3;
  const sawSun = !!sky?.things.includes('sun');
  const sawMoon = !!sky?.things.includes('moon');
  const cloudCount = sky ? { none: 0, few: 1, scattered: 2, overcast: 3 }[sky.clouds] : 0;
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
            <Stop offset="0" stopColor="#45336E" />
            <Stop offset="0.55" stopColor="#2B2140" />
            <Stop offset="1" stopColor="#1B1622" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#glow)" />
      </Svg>
      {sky ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="none">
          <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id="todaysky" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={sky.colors[0]} />
                <Stop offset="0.6" stopColor={sky.colors[1]} />
                <Stop offset="1" stopColor={sky.colors[2]} />
              </LinearGradient>
              {/* Keeps white text readable on a bright sky. */}
              <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#0a091a" stopOpacity={0.1} />
                <Stop offset="1" stopColor="#0a091a" stopOpacity={darkSky ? 0.15 : 0.45} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill="url(#todaysky)" />
            <Rect x="0" y="0" width="100" height="100" fill="url(#scrim)" />
          </Svg>
          {sawSun || sawMoon ? (
            <View style={styles.orb}>
              <Svg width={46} height={46} viewBox="0 0 100 100">
                <Defs>
                  <RadialGradient id="horb" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor="#FFF4D2" stopOpacity={0.55} />
                    <Stop offset="1" stopColor="#FFF4D2" stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx="50" cy="50" r="50" fill="url(#horb)" />
                {sawSun ? (
                  <Circle cx="50" cy="50" r="20" fill="#FFF6D8" />
                ) : (
                  <Path d="M56 30 A21 21 0 1 0 71 63 A17 17 0 1 1 56 30 Z" fill="#FFF4D2" />
                )}
              </Svg>
            </View>
          ) : null}
          {Array.from({ length: cloudCount }, (_, i) => (
            <HeaderCloud key={i} x={[0.42, 0.72, 0.2][i]} y={[0.3, 0.52, 0.04][i]} w={[130, 110, 90][i]} color={sky.cloudColor} />
          ))}
        </Animated.View>
      ) : null}
      {darkSky ? dust : null}
      {darkSky
        ? STARS.map((s, i) => <Twinkle key={i} star={s} />)
        : null}
      <View>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#2B2140',
  },
  orb: {
    position: 'absolute',
    right: 64,
    top: 50,
  },
  dust: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
