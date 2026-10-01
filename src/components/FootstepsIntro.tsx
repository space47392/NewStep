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
import { colors, spacing, fontSize, fontFamily } from '../constants/theme';

type Props = {
  onDone: () => void;
};

const STEPS = 9;
const STEP_MS = 380;
// How many steps stay visible behind the newest one before fading out.
const TRAIL = 3;
const SWIPE_DISTANCE = 80;

// Shown once per app launch in front of the login screen (see LoginScreen):
// only footprints walking up the screen, until a swipe up or down sends the
// whole page off in that direction — footprints still walking — revealing
// the login underneath.
export default function FootstepsIntro({ onDone }: Props) {
  const { width, height } = useWindowDimensions();
  const walk = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const hint = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
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

  const leave = (direction: 1 | -1) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    loopRef.current?.stop();
    // Keep walking — faster — while the page slides away.
    walk.stopAnimation((current) => {
      // Mid-walk: carry on from where the feet are. Already past the top
      // (trail fading): start a fresh walk so there's something to see.
      const from = current < STEPS - 1 ? current : 0;
      walk.setValue(from);
      Animated.parallel([
        Animated.timing(walk, {
          toValue: STEPS + TRAIL,
          duration: Math.max(300, (STEPS + TRAIL - from) * 75),
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(slide, {
          toValue: direction * height,
          duration: 650,
          delay: 150,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => onDone());
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
      onPanResponderMove: (_, g) => {
        if (!leavingRef.current) slide.setValue(g.dy * 0.6);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -SWIPE_DISTANCE || g.vy < -0.5) {
          leave(-1);
        } else if (g.dy > SWIPE_DISTANCE || g.vy > 0.5) {
          leave(1);
        } else {
          Animated.spring(slide, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  // Steps climb from near the bottom to near the top, alternating left and
  // right foot with a gentle sway so the path feels walked, not ruled.
  const top = height * 0.12;
  const bottom = height * 0.78;
  const gap = (bottom - top) / (STEPS - 1);
  const centerX = width / 2;

  if (reduceMotion) {
    return (
      <View style={[styles.container, StyleSheet.absoluteFill]}>
        <StatusBar style="light" />
        <Ionicons name="footsteps" size={48} color="#fff" />
        <TouchableOpacity style={styles.staticButton} onPress={onDone} accessibilityRole="button">
          <Text style={styles.staticButtonText}>Take your first step</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Animated.View
      style={[styles.container, StyleSheet.absoluteFill, { transform: [{ translateY: slide }] }]}
      {...panResponder.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Welcome to NewStep. Double tap to continue."
      onAccessibilityTap={() => leave(-1)}
    >
      {/* White clock/battery on the purple page; App.tsx's dark style
          comes back on its own once this unmounts. */}
      <StatusBar style="light" />
      {Array.from({ length: STEPS }, (_, i) => {
        const isLeft = i % 2 === 0;
        const sway = Math.sin(i * 0.7) * 18;
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
                left: centerX + sway + (isLeft ? -26 : 8),
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

      <Animated.View
        style={[
          styles.hint,
          {
            opacity: hint,
            transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
          },
        ]}
        pointerEvents="none"
      >
        <Ionicons name="chevron-up" size={22} color="#fff" />
        <Text style={styles.hintText}>Swipe up to take your first step</Text>
      </Animated.View>
    </Animated.View>
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 10,
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
    backgroundColor: '#fff',
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
    backgroundColor: '#fff',
  },
  heel: {
    width: 12,
    height: 9,
    marginTop: 2,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  hint: {
    position: 'absolute',
    bottom: spacing.xxl + spacing.lg,
    alignItems: 'center',
  },
  hintText: {
    marginTop: spacing.xs,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: '#fff',
    opacity: 0.9,
  },
  staticButton: {
    marginTop: spacing.xl,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  staticButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    color: colors.primary,
  },
});
