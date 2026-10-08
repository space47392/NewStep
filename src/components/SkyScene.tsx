import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../constants/theme';
import { brightness, SkyPalette } from '../lib/skyColors';

// The School Sky backdrop: a sky that follows the real time of day, a field
// of tiny stars, the odd shooting star, and a horizon with the school's
// silhouette so it reads as "the sky over our school".

export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';

export function skyPhase(date = new Date()): SkyPhase {
  const h = date.getHours();
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

// "Tonight", "This morning"… for the header line.
export function phaseWords(phase: SkyPhase): string {
  return { dawn: 'This morning', day: 'Today', dusk: 'This evening', night: 'Tonight' }[phase];
}

const GRADIENTS: Record<SkyPhase, [string, string, string]> = {
  night: ['#2B2470', colors.night, '#120F33'],
  dawn: ['#3E3288', '#9A6AA6', '#E9A99B'],
  day: ['#33489A', '#5F7FC6', '#9DB6E4'],
  dusk: ['#2A2270', '#7E4686', '#E38A6A'],
};

// How visible the star field is at each time of day.
const STARFIELD_OPACITY: Record<SkyPhase, number> = { night: 1, dusk: 0.55, dawn: 0.45, day: 0.12 };

// Deterministic "random" so the star field doesn't reshuffle on re-render.
function seeded(n: number) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function TwinkleDot({ x, y, r, delay }: { x: number; y: number; r: number; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
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
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        backgroundColor: '#fff',
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
      }}
    />
  );
}

function ShootingStar() {
  const { width } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(5200),
        Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(3800),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.shooting,
        {
          left: width * 0.55,
          opacity: t.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 0.8, 0] }),
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, -width * 0.45] }) },
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, width * 0.22] }) },
            { rotate: '-26deg' },
          ],
        },
      ]}
    />
  );
}

// painted: today's sky colours from classmates' photos. When present it
// fades in over the time-of-day sky, like the sky being painted.
export default function SkyScene({ phase, painted }: { phase: SkyPhase; painted?: SkyPalette | null }) {
  const [top, mid, bottom] = GRADIENTS[phase];
  const paint = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!painted) return;
    paint.setValue(0);
    Animated.timing(paint, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
  }, [painted?.join(','), paint]);
  const field = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        x: seeded(i + 1),
        y: seeded(i + 101) * 0.82,
        r: seeded(i + 201) < 0.85 ? 0.8 : 1.4,
        twinkle: seeded(i + 301) < 0.22,
        delay: Math.floor(seeded(i + 401) * 3000),
      })),
    []
  );
  // A bright painted sky (a photo taken at noon) dims the star field.
  const fieldOpacity = painted
    ? Math.max(0.15, Math.min(1, 1.3 - brightness(painted[0]) * 2.2))
    : STARFIELD_OPACITY[phase];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="skyfill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="0.55" stopColor={mid} />
            <Stop offset="1" stopColor={bottom} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#skyfill)" />
      </Svg>
      {painted ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: paint }]}>
          <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id="paintfill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={painted[0]} />
                <Stop offset="0.5" stopColor={painted[1]} />
                <Stop offset="1" stopColor={painted[2]} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill="url(#paintfill)" />
          </Svg>
        </Animated.View>
      ) : null}
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
        {/* Static dust, drawn in one SVG for cheapness. */}
        {field
          .filter((s) => !s.twinkle)
          .map((s, i) => (
            <Circle key={i} cx={s.x * 100} cy={s.y * 100} r={s.r * 0.12} fill="#fff" opacity={0.55 * fieldOpacity} />
          ))}
      </Svg>
      <View style={[StyleSheet.absoluteFill, { opacity: fieldOpacity }]}>
        {field
          .filter((s) => s.twinkle)
          .map((s, i) => (
            <TwinkleDot key={i} x={s.x} y={s.y} r={s.r} delay={s.delay} />
          ))}
      </View>
      {phase === 'night' || phase === 'dusk' ? <ShootingStar /> : null}
      {/* A glowing crescent at night, a soft low sun otherwise. */}
      <Svg style={styles.orb} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="orbglow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={phase === 'night' ? '#FFF4D2' : '#FFD9A0'} stopOpacity={0.35} />
            <Stop offset="1" stopColor={phase === 'night' ? '#FFF4D2' : '#FFD9A0'} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill="url(#orbglow)" />
        {phase === 'night' ? (
          <Path d="M56 26 A25 25 0 1 0 74 66 A20 20 0 1 1 56 26 Z" fill="#FFF4D2" />
        ) : (
          <Circle cx="50" cy="50" r="18" fill="#FFE3B5" opacity={0.8} />
        )}
      </Svg>
    </View>
  );
}

// Rolling hills and the school's roofline with a few lit windows. Sits at
// the bottom of the sky area; its front layer is the screen background, so
// whatever is below it reads as solid ground.
export function Horizon() {
  return (
    <View style={styles.horizon} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="none">
        <Path d="M0 70 C60 52 120 60 170 66 C230 74 300 48 400 58 L400 120 L0 120 Z" fill="#100E28" opacity={0.65} />
        <Path
          d="M0 92 C50 84 90 86 120 88 L120 64 L150 64 L150 54 L175 40 L200 54 L200 64 L262 64 L262 76 C310 70 350 78 400 74 L400 120 L0 120 Z"
          fill={colors.background}
        />
        {/* A few lit windows in the school. */}
        <Rect x="160" y="70" width="6" height="6" fill={colors.sticker.yellow} opacity={0.75} />
        <Rect x="184" y="70" width="6" height="6" fill={colors.sticker.yellow} opacity={0.5} />
        <Rect x="222" y="74" width="6" height="6" fill={colors.sticker.yellow} opacity={0.65} />
        <Rect x="240" y="74" width="6" height="6" fill={colors.sticker.yellow} opacity={0.35} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  shooting: {
    position: 'absolute',
    top: '12%',
    width: 90,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#fff',
  },
  orb: {
    position: 'absolute',
    top: '19%',
    right: '4%',
    width: 120,
    height: 120,
  },
  horizon: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
  },
});
