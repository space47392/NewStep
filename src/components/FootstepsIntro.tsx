import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  Easing,
  PanResponder,
  AccessibilityInfo,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, dark, light, spacing, fontSize, fontFamily } from '../constants/theme';

function WarmGlow() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="introGlow" cx="50%" cy="100%" r="85%">
          <Stop offset="0" stopColor="#F0A55A" stopOpacity={0.12} />
          <Stop offset="0.55" stopColor="#E8B064" stopOpacity={0.03} />
          <Stop offset="1" stopColor="#E8B064" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#introGlow)" />
    </Svg>
  );
}

const SPARKLE = 'M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z';

type Props = {
  onDone: () => void;
};

const STEPS = 7;
const STEP_MS = 380;
// How many steps stay visible behind the newest one before fading out.
const TRAIL = 3;
const SWIPE_DISTANCE = 80;
// Little stars thrown out when the light bursts.
const SPARKS = 12;
const ORB = 22;

// Shown once per app launch in front of the login screen (see LoginScreen):
// golden footsteps walk up through the dark. Dragging up gathers a small
// light where they end; letting go bursts it outwards — a golden ring at its
// edge, stars flying — until the whole screen is the warm bright colour of
// the login page underneath, which then simply takes over.
export default function FootstepsIntro({ onDone }: Props) {
  const { width, height } = useWindowDimensions();
  const walk = useRef(new Animated.Value(0)).current;
  const hint = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  // 0..1 while dragging up: the light gathering.
  const charge = useRef(new Animated.Value(0)).current;
  // 0..1 once released: the light filling the screen.
  const burst = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const leavingRef = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    // One full walk up the screen, then the trail fades out and it repeats.
    loopRef.current = Animated.loop(
      Animated.timing(walk, {
        toValue: STEPS + TRAIL + 1,
        duration: (STEPS + TRAIL + 1) * STEP_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loopRef.current.start();

    Animated.timing(hint, { toValue: 1, duration: 500, delay: 1400, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();

    return () => loopRef.current?.stop();
  }, [walk, hint, bob]);

  const leave = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    loopRef.current?.stop();
    Animated.sequence([
      Animated.timing(charge, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.timing(burst, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => onDone());
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
      onPanResponderMove: (_, g) => {
        if (!leavingRef.current) charge.setValue(Math.min(1, Math.max(0, -g.dy) / (SWIPE_DISTANCE * 1.6)));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -SWIPE_DISTANCE || g.vy < -0.5 || g.dy > SWIPE_DISTANCE || g.vy > 0.5) {
          leave();
        } else {
          Animated.spring(charge, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  // Steps climb from near the bottom to the light, alternating left and
  // right foot.
  const top = height * 0.26;
  const bottom = height * 0.8;
  const gap = (bottom - top) / (STEPS - 1);
  const centerX = width / 2;
  // Where the light gathers and bursts from: just above the last step.
  const originX = centerX;
  const originY = top - 34;
  // Big enough to cover the screen from the origin.
  const cover = 2 * Math.hypot(Math.max(originX, width - originX), Math.max(originY, height - originY)) + 40;

  if (reduceMotion) {
    return (
      <View style={[styles.container, StyleSheet.absoluteFill]}>
        <StatusBar style="light" />
        <Ionicons name="footsteps" size={48} color={colors.primary} />
        <TouchableOpacity style={styles.staticButton} onPress={onDone} accessibilityRole="button">
          <Text style={styles.staticButtonText}>Take your first step</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const fill = burst.interpolate({ inputRange: [0, 1], outputRange: [0.01, 1] });
  const at = (size: number) => ({
    position: 'absolute' as const,
    left: originX - size / 2,
    top: originY - size / 2,
    width: size,
    height: size,
    borderRadius: size / 2,
  });

  return (
    <View
      style={[styles.container, StyleSheet.absoluteFill]}
      {...panResponder.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Welcome to NewStep. Double tap to continue."
      onAccessibilityTap={leave}
    >
      <StatusBar style="light" />
      <WarmGlow />
      {Array.from({ length: STEPS }, (_, i) => {
        const isLeft = i % 2 === 0;
        // Each step lights up as the walk reaches it, then fades a few steps
        // later.
        const opacity = walk.interpolate({
          inputRange: [i, i + 0.15, i + TRAIL, i + TRAIL + 1],
          outputRange: [0, 1, 0.5, 0],
          extrapolate: 'clamp',
        });
        const scale = walk.interpolate({
          inputRange: [i, i + 0.15, i + 0.4],
          outputRange: [0.6, 1.1, 1],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.foot,
              {
                left: centerX + (isLeft ? -22 : 4),
                top: bottom - i * gap,
                opacity,
                transform: [{ scale }, { rotate: isLeft ? '-8deg' : '8deg' }, { scaleX: isLeft ? -1 : 1 }],
              },
            ]}
          >
            <Foot />
          </Animated.View>
        );
      })}

      {/* The light gathering while you drag. */}
      <Animated.View
        pointerEvents="none"
        style={[
          at(ORB * 8),
          {
            opacity: charge,
            transform: [{ scale: charge.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
          },
        ]}
      >
        <Svg width={ORB * 8} height={ORB * 8}>
          <Defs>
            <RadialGradient id="gather" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFD27A" stopOpacity={0.55} />
              <Stop offset="0.45" stopColor="#F5A84E" stopOpacity={0.18} />
              <Stop offset="1" stopColor="#F5A84E" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={ORB * 8} height={ORB * 8} fill="url(#gather)" />
        </Svg>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          at(ORB),
          styles.orb,
          { opacity: charge, transform: [{ scale: charge.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.4] }) }] },
        ]}
      />

      {/* The burst: a golden ring running just ahead of the light. */}
      <Animated.View
        pointerEvents="none"
        style={[
          at(cover),
          styles.ring,
          {
            opacity: burst.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 0.6, 0] }),
            transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.02, 1.06] }) }],
          },
        ]}
      />
      <Animated.View pointerEvents="none" style={[at(cover), styles.flood, { transform: [{ scale: fill }] }]} />

      {/* Stars thrown outwards. */}
      {Array.from({ length: SPARKS }, (_, i) => {
        const angle = (i / SPARKS) * Math.PI * 2 + (i % 2) * 0.2;
        const dist = (i % 3 === 0 ? 0.42 : 0.3) * Math.min(width, height);
        const size = i % 3 === 0 ? 16 : 10;
        return (
          <Animated.View
            key={`s${i}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: originX - size / 2,
              top: originY - size / 2,
              opacity: burst.interpolate({ inputRange: [0, 0.1, 0.6, 0.9], outputRange: [0, 1, 0.9, 0] }),
              transform: [
                { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * dist] }) },
                { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * dist] }) },
                { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${i % 2 ? 90 : -90}deg`] }) },
              ],
            }}
          >
            <Svg width={size} height={size} viewBox="0 0 24 24">
              <Path d={SPARKLE} fill={i % 3 === 0 ? '#FFD27A' : '#F5A84E'} />
            </Svg>
          </Animated.View>
        );
      })}

      <Animated.View
        style={[
          styles.hint,
          {
            opacity: Animated.multiply(hint, charge.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' })),
            transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
          },
        ]}
        pointerEvents="none"
      >
        <Ionicons name="chevron-up" size={18} color={dark.textLight} />
        <Text style={styles.hintText}>Swipe up to take your first step</Text>
      </Animated.View>
    </View>
  );
}

// A single bare footprint: a sole plus a row of toes, drawn with plain Views
// so left/right can be mirrored (the icon font only has a pair of feet).
function Foot() {
  return (
    <View style={styles.footShape}>
      <View style={styles.toes}>
        <View style={[styles.toe, styles.toeBig]} />
        <View style={styles.toe} />
        <View style={styles.toe} />
        <View style={[styles.toe, styles.toeSmall]} />
      </View>
      <View style={styles.sole} />
      <View style={styles.heel} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: dark.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 10,
    overflow: 'hidden',
  },
  foot: {
    position: 'absolute',
  },
  footShape: {
    width: 20,
    alignItems: 'center',
  },
  toes: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1.5,
    marginBottom: 2,
  },
  toe: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  toeBig: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  toeSmall: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  sole: {
    width: 16,
    height: 18,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: colors.primary,
  },
  heel: {
    width: 12,
    height: 9,
    marginTop: 2,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  orb: {
    backgroundColor: '#FFF1C9',
  },
  ring: {
    backgroundColor: '#FFC56A',
  },
  // The same colour as the login page, so the hand-over is seamless.
  flood: {
    backgroundColor: light.background,
  },
  hint: {
    position: 'absolute',
    bottom: spacing.xxl + spacing.lg,
    alignItems: 'center',
  },
  hintText: {
    marginTop: 2,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: dark.textLight,
  },
  staticButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  staticButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    color: colors.onPrimary,
  },
});
