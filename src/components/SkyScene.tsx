import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../constants/theme';
import { brightness, mixHex, SkyPalette } from '../lib/skyColors';
import { Tilt, tiltTransform } from '../lib/useTilt';

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
export default function SkyScene({ phase, painted, tilt }: { phase: SkyPhase; painted?: SkyPalette | null; tilt?: Tilt }) {
  // The whole star field turns very slowly, like the real night sky does.
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 900000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [turn]);
  const [top, mid, bottom] = GRADIENTS[phase];
  const paint = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!painted) return;
    paint.setValue(0);
    Animated.timing(paint, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
  }, [painted?.join(','), paint]);
  const field = useMemo(
    () =>
      Array.from({ length: 220 }, (_, i) => ({
        x: seeded(i + 1),
        y: seeded(i + 101),
        r: seeded(i + 201) < 0.85 ? 0.8 : 1.4,
        twinkle: seeded(i + 301) < 0.12,
        delay: Math.floor(seeded(i + 401) * 3000),
      })),
    []
  );
  // The photos only tint the real sky: a little up high, more toward the
  // horizon, so the top stays a believable night (or day) sky.
  const tinted = painted
    ? [mixHex(top, painted[0], 0.22), mixHex(mid, painted[1], 0.35), mixHex(bottom, painted[2], 0.5)]
    : null;
  const fieldOpacity = tinted
    ? Math.max(0.15, Math.min(1, 1.3 - brightness(tinted[0]) * 2.2)) * STARFIELD_OPACITY[phase] + (1 - STARFIELD_OPACITY[phase]) * 0.1
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
                <Stop offset="0" stopColor={tinted![0]} />
                <Stop offset="0.55" stopColor={tinted![1]} />
                <Stop offset="1" stopColor={tinted![2]} />
              </LinearGradient>
              {/* The photos' lower-sky colour as a soft glow over the
                  horizon, like a sunset or the town's lights. */}
              <RadialGradient id="horizonglow" cx="50%" cy="100%" rx="75%" ry="38%">
                <Stop offset="0" stopColor={painted[2]} stopOpacity={0.55} />
                <Stop offset="0.6" stopColor={painted[1]} stopOpacity={0.18} />
                <Stop offset="1" stopColor={painted[1]} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill="url(#paintfill)" />
            <Rect x="0" y="40" width="100" height="60" fill="url(#horizonglow)" />
          </Svg>
        </Animated.View>
      ) : null}
      {/* Far layer: the star field and the Milky Way, on a square twice the
          screen's size so it can turn without showing its edges. Barely
          moves with tilt — it's the farthest thing. */}
      <Animated.View
        style={[
          styles.farField,
          {
            transform: [
              ...tiltTransform(tilt, 5),
              { rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
            ],
          },
        ]}
      >
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="milkyway" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#C9C2FF" stopOpacity={0} />
              <Stop offset="0.5" stopColor="#E6E1FF" stopOpacity={0.16} />
              <Stop offset="1" stopColor="#C9C2FF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {/* A soft diagonal band of light… */}
          <Rect x="-20" y="42" width="140" height="16" fill="url(#milkyway)" opacity={fieldOpacity} transform="rotate(-28 50 50)" />
          <Rect x="-20" y="46" width="140" height="7" fill="url(#milkyway)" opacity={fieldOpacity * 0.8} transform="rotate(-28 50 50)" />
          {/* …dusted with far more tiny stars than the rest of the sky. */}
          {Array.from({ length: 160 }, (_, i) => {
            const along = seeded(i + 601) * 140 - 20;
            const across = (seeded(i + 701) + seeded(i + 801) - 1) * 7;
            const a = (-28 * Math.PI) / 180;
            const cx = 50 + (along - 50) * Math.cos(a) - across * Math.sin(a);
            const cy = 50 + (along - 50) * Math.sin(a) + across * Math.cos(a);
            return <Circle key={`m${i}`} cx={cx} cy={cy} r={0.06 + seeded(i + 901) * 0.06} fill="#fff" opacity={0.5 * fieldOpacity} />;
          })}
          {field
            .filter((s) => !s.twinkle)
            .map((s, i) => (
              <Circle key={i} cx={s.x * 100} cy={s.y * 100} r={s.r * 0.07} fill="#fff" opacity={0.6 * fieldOpacity} />
            ))}
        </Svg>
        <View style={[StyleSheet.absoluteFill, { opacity: fieldOpacity }]}>
          {field
            .filter((s) => s.twinkle)
            .map((s, i) => (
              <TwinkleDot key={i} x={s.x} y={s.y} r={s.r} delay={s.delay} />
            ))}
        </View>
      </Animated.View>
      {phase === 'night' || phase === 'dusk' ? <ShootingStar /> : null}
      {/* A glowing crescent at night, a soft low sun otherwise. */}
      <Animated.View style={[styles.orb, { transform: tiltTransform(tilt, 12) }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
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
      </Animated.View>
    </View>
  );
}

// Rolling hills and the school's roofline with a few lit windows. Sits at
// the bottom of the sky area; its front layer is the screen background, so
// whatever is below it reads as solid ground.
export function Horizon({ tilt }: { tilt?: Tilt }) {
  return (
    <Animated.View style={[styles.horizon, { transform: tiltTransform(tilt, 18) }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="none">
        <Path d="M0 70 C60 52 120 60 170 66 C230 74 300 48 400 58 L400 120 L0 120 Z" fill="#100E28" opacity={0.65} />
        {/* Someone sitting on the hill, hugging their knees and looking up. */}
        <Circle cx="331" cy="40.5" r="3.6" fill="#0C0A22" />
        <Path d="M329 44 C326 47 325 51 326 55 L341 55 C341 52 339 50 336 49 L337 46 C335 45 332 44 329 44 Z" fill="#0C0A22" />
        <Path d="M334 47 C337 45 340 46 341 49 L342 55 L338 55 L337.5 50 Z" fill="#0C0A22" />
        {/* A small tree beside them. */}
        <Path d="M356 52 L356 44" stroke="#0C0A22" strokeWidth={1.4} />
        <Circle cx="356" cy="40" r="5.5" fill="#0C0A22" />
        <Circle cx="352" cy="43" r="3.8" fill="#0C0A22" />
        <Circle cx="360" cy="43" r="3.8" fill="#0C0A22" />
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shooting: {
    position: 'absolute',
    // Below the header text, across the open sky.
    top: '34%',
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
  // Wider than the screen so tilting never shows its ends.
  horizon: {
    position: 'absolute',
    left: -24,
    right: -24,
    bottom: -8,
    height: 118,
  },
  farField: {
    position: 'absolute',
    width: '200%',
    aspectRatio: 1,
    left: '-50%',
    top: '-30%',
  },
});
