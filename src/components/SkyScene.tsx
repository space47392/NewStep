import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../constants/theme';
import { brightness, SkyPalette } from '../lib/skyColors';
import { Tilt, tiltTransform } from '../lib/useTilt';
import { SkyClouds, SkyThing } from '../lib/sky';
import SkyThings from './SkyThings';

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

// Soft clouds painted from a description: how many depends on how cloudy
// it was, tinted with the description's cloud colour, drifting slowly.
const CLOUD_COUNT: Record<SkyClouds, number> = { none: 0, few: 2, scattered: 4, overcast: 8 };

function DescribedCloud({ i, color, width, height, overcast }: { i: number; color: string; width: number; height: number; overcast: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 50000 + i * 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 50000 + i * 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t, i]);
  const w = width * (overcast ? 1.1 : 0.55 + seeded(i + 31) * 0.35);
  const h = w * 0.34;
  const x = (seeded(i + 11) - 0.2) * width;
  const y = height * (overcast ? 0.05 + i * 0.085 : 0.16 + seeded(i + 21) * 0.5);
  const id = `dc${i}`;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - w / 4,
        top: y,
        opacity: overcast ? 0.62 : 0.78,
        transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.08, width * 0.08] }) }],
      }}
    >
      <Svg width={w} height={h} viewBox="0 0 100 34">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="55%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.95} />
            <Stop offset="0.6" stopColor={color} stopOpacity={0.55} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* A few overlapping puffs make one soft cloud. */}
        <Circle cx="30" cy="20" r="14" fill={`url(#${id})`} />
        <Circle cx="50" cy="15" r="17" fill={`url(#${id})`} />
        <Circle cx="70" cy="20" r="14" fill={`url(#${id})`} />
        <Circle cx="50" cy="24" r="16" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

export type DescribedSkyLook = { colors: SkyPalette; clouds: SkyClouds; cloudColor: string };

// Hand-made sky backdrops (assets/sky): a realistic sky for each time of
// day — dawn pastels, a clear blue day with cumulus, a sunset with clouds
// lit from below, a starry night with the Milky Way. Generated once and
// shipped with the app, so it costs nothing to draw.
const SKY_IMAGES: Record<SkyPhase, number> = {
  dawn: require('../../assets/sky/dawn.jpg'),
  day: require('../../assets/sky/day.jpg'),
  dusk: require('../../assets/sky/dusk.jpg'),
  night: require('../../assets/sky/night.jpg'),
};

// painted: today's sky colours from classmates' photos. It fades in as a
// light tint over the real sky — never replaces it.
// things: what classmates described seeing (rainbow, birds…), drawn in.
// described: a sky someone described in words. Unlike photo colours it
// repaints the whole sky — colours, clouds and all — so the screen looks
// like what they said.
export default function SkyScene({
  phase,
  painted,
  tilt,
  things = [],
  described,
}: {
  phase: SkyPhase;
  painted?: SkyPalette | null;
  tilt?: Tilt;
  things?: SkyThing[];
  described?: DescribedSkyLook | null;
}) {
  const { width, height } = useWindowDimensions();
  // A very slow drift, like clouds and stars moving across the sky.
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 60000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 60000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  const paint = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!painted) return;
    paint.setValue(0);
    Animated.timing(paint, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
  }, [painted?.join(','), paint]);

  const describedKey = described ? described.colors.join(',') + described.clouds + described.cloudColor : '';
  const repaint = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!described) return;
    repaint.setValue(0);
    Animated.timing(repaint, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
  }, [describedKey, repaint]);
  // A described sky decides for itself whether it's dark enough for stars.
  const darkSky = described ? brightness(described.colors[0]) < 0.3 : phase === 'night' || phase === 'dusk';

  // A few stars on top of the image that twinkle, so the night is alive.
  const twinkles = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        x: seeded(i + 1),
        y: seeded(i + 101) * 0.6,
        r: seeded(i + 201) < 0.8 ? 0.9 : 1.4,
        delay: Math.floor(seeded(i + 401) * 3000),
      })),
    []
  );
  const twinkleOpacity = described ? (darkSky || things.includes('stars') ? 0.9 : 0) : STARFIELD_OPACITY[phase];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The real sky: slightly oversized so the drift and tilt never
          show an edge. */}
      <Animated.Image
        source={SKY_IMAGES[phase]}
        resizeMode="cover"
        style={[
          styles.skyImage,
          { width: width * 1.12, height: height * 1.08 },
          {
            transform: [
              ...tiltTransform(tilt, 6),
              { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.04, width * 0.04] }) },
              { scale: drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.03, 1] }) },
            ],
          },
        ]}
      />
      {painted ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: paint }]}>
          <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id="paintfill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={painted[0]} stopOpacity={0.12} />
                <Stop offset="0.55" stopColor={painted[1]} stopOpacity={0.2} />
                <Stop offset="1" stopColor={painted[2]} stopOpacity={0.32} />
              </LinearGradient>
              {/* The photos' lower-sky colour as a soft glow over the
                  horizon, like a sunset or the town's lights. */}
              <RadialGradient id="horizonglow" cx="50%" cy="100%" rx="75%" ry="38%">
                <Stop offset="0" stopColor={painted[2]} stopOpacity={0.45} />
                <Stop offset="1" stopColor={painted[1]} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill="url(#paintfill)" />
            <Rect x="0" y="40" width="100" height="60" fill="url(#horizonglow)" />
          </Svg>
        </Animated.View>
      ) : null}
      {described ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: repaint }]}>
          <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id="descfill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={described.colors[0]} stopOpacity={0.94} />
                <Stop offset="0.55" stopColor={described.colors[1]} stopOpacity={0.9} />
                <Stop offset="1" stopColor={described.colors[2]} stopOpacity={0.92} />
              </LinearGradient>
              <RadialGradient id="descglow" cx="50%" cy="100%" rx="80%" ry="40%">
                <Stop offset="0" stopColor={described.colors[2]} stopOpacity={0.7} />
                <Stop offset="1" stopColor={described.colors[2]} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill="url(#descfill)" />
            <Rect x="0" y="45" width="100" height="55" fill="url(#descglow)" />
          </Svg>
          {Array.from({ length: CLOUD_COUNT[described.clouds] }, (_, i) => (
            <DescribedCloud
              key={i}
              i={i}
              color={described.cloudColor}
              width={width}
              height={height}
              overcast={described.clouds === 'overcast'}
            />
          ))}
        </Animated.View>
      ) : null}
      {twinkleOpacity > 0.2 ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: twinkleOpacity, transform: tiltTransform(tilt, 6) }]}>
          {twinkles.map((s, i) => (
            <TwinkleDot key={i} x={s.x} y={s.y} r={s.r} delay={s.delay} />
          ))}
        </Animated.View>
      ) : null}
      <SkyThings things={things} />
      {darkSky ? <ShootingStar /> : null}
      {/* A glowing crescent at night, a soft low sun otherwise. */}
      <Animated.View style={[styles.orb, { transform: tiltTransform(tilt, 12) }]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="orbglow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={phase === 'night' ? '#FFF4D2' : '#FFE9C2'} stopOpacity={described && !things.includes('moon') && !things.includes('sun') ? 0 : phase === 'day' ? 0.5 : 0.35} />
              <Stop offset="1" stopColor={phase === 'night' ? '#FFF4D2' : '#FFE9C2'} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill="url(#orbglow)" />
          {(described ? things.includes('moon') : phase === 'night' || things.includes('moon')) && !things.includes('sun') ? (
            <Path d="M56 26 A25 25 0 1 0 74 66 A20 20 0 1 1 56 26 Z" fill="#FFF4D2" />
          ) : (described ? things.includes('sun') : phase === 'day' || things.includes('sun')) ? (
            <Circle cx="50" cy="50" r="16" fill="#FFFBEA" />
          ) : null}
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
        <Path d="M0 70 C60 52 120 60 170 66 C230 74 300 48 400 58 L400 120 L0 120 Z" fill="#1A1638" opacity={0.92} />
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
  skyImage: {
    position: 'absolute',
    left: '-6%',
    top: '-4%',
  },
});
