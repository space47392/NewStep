import { useEffect, useState } from 'react';
import { View, TouchableOpacity, Animated, Easing, StyleSheet, useAnimatedValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Lantern } from '../../lib/lanterns';
import { SkyWish, starPosition, SkyStar } from '../../lib/sky';

// The things drifting through School Sky besides the stars: a shooting star
// to catch for a wish, lanterns, wishes, and today's constellation.

// A slower shooting star you can catch (tap) to make a wish. Crosses the
// sky every so often; more often when the school is excited.
export function CatchableStar({ width, height, frequent, onCatch }: { width: number; height: number; frequent: boolean; onCatch: () => void }) {
  const t = useAnimatedValue(0);
  const [flying, setFlying] = useState(false);
  const [lane] = useState(() => Math.random());
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const fly = () => {
      if (cancelled) return;
      t.setValue(0);
      setFlying(true);
      Animated.timing(t, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(() => {
        if (cancelled) return;
        setFlying(false);
        timer = setTimeout(fly, (frequent ? 5000 : 11000) + Math.random() * 5000);
      });
    };
    timer = setTimeout(fly, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      t.stopAnimation();
    };
  }, [t, frequent]);
  if (!flying || width === 0) return null;
  const startY = height * (0.08 + lane * 0.25);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: width * 0.9,
        top: startY,
        opacity: t.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, -width * 0.75] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.22] }) },
        ],
      }}
    >
      <TouchableOpacity
        onPress={() => {
          t.stopAnimation();
          setFlying(false);
          onCatch();
        }}
        hitSlop={{ top: 30, bottom: 30, left: 30, right: 30 }}
        accessibilityRole="button"
        accessibilityLabel="Catch the shooting star to make a wish"
        style={styles.catchStar}
      >
        <View style={styles.catchHead} />
        <View style={styles.catchTail} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// A classmate's lantern, drifting up slowly with a warm glow.
export function FloatingLantern({ lantern, index, width, height, onPress }: { lantern: Lantern; index: number; width: number; height: number; onPress: () => void }) {
  const drift = useAnimatedValue(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 5200 + (index % 3) * 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 5200 + (index % 3) * 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift, index]);
  let h = 7;
  for (let i = 0; i < lantern.id.length; i++) h = (h * 33 + lantern.id.charCodeAt(i)) >>> 0;
  const x = 0.08 + ((h % 1000) / 1000) * 0.84;
  // Below the empty-sky message, above the wish lights on the horizon.
  const y = Math.min(0.5 + (((h >> 10) % 1000) / 1000) * 0.14, (height - 240) / height);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x * width - 14,
        top: y * height,
        transform: [
          { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
          { rotate: drift.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '4deg'] }) },
        ],
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={`A lantern: ${lantern.text}`}
        style={styles.lanternWrap}
      >
        <View style={styles.lanternGlow} />
        <View style={styles.lanternTop} />
        <View style={[styles.lanternBody, lantern.mine && styles.lanternBodyMine]} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// Today's wishes, as small warm lights floating just above the horizon.
export function WishLight({ wish, index, width, height, selected, onPress }: { wish: SkyWish; index: number; width: number; height: number; selected: boolean; onPress: () => void }) {
  const bob = useAnimatedValue(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 2200 + (index % 4) * 400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 2200 + (index % 4) * 400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bob, index]);
  let h = 0;
  for (let i = 0; i < wish.id.length; i++) h = (h * 31 + wish.id.charCodeAt(i)) >>> 0;
  const x = 0.06 + ((h % 1000) / 1000) * 0.88;
  const y = height - 150 - ((h >> 10) % 70);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x * width - 14,
        top: y,
        transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={`A wish: ${wish.text}`}
        style={styles.wishWrap}
      >
        <View style={[styles.wishGlow, selected && styles.wishGlowSelected]} />
        <View style={[styles.wishCore, wish.mine && styles.wishCoreMine]} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// Faint dotted lines joining today's stars, left to right: the school's
// constellation for the day.
export function Constellation({ stars, width, height }: { stars: SkyStar[]; width: number; height: number }) {
  if (stars.length < 2 || width === 0) return null;
  const pts = stars
    .map((st, i) => starPosition(st.user_id, i))
    .map((p) => ({ x: p.x * width, y: p.y * height }))
    .sort((a, b) => a.x - b.x);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={d} stroke="#fff" strokeOpacity={0.22} strokeWidth={1} strokeDasharray="2 5" fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  catchStar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  catchHead: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#FFF7D6',
    shadowColor: '#FFF7D6',
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  catchTail: {
    width: 70,
    height: 2,
    marginLeft: -2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,247,214,0.55)',
    // Trails up and to the right, behind a star falling down-left.
    transform: [{ rotate: '-16deg' }, { translateY: -9 }],
  },
  wishWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishGlow: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,196,120,0.22)',
  },
  wishGlowSelected: {
    backgroundColor: 'rgba(255,196,120,0.5)',
  },
  wishCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFC478',
  },
  wishCoreMine: {
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  lanternWrap: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lanternGlow: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,170,90,0.2)',
  },
  lanternTop: {
    width: 10,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#8A4B2A',
    marginBottom: 1,
  },
  lanternBody: {
    width: 18,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#FFB46E',
    borderWidth: 1.5,
    borderColor: '#FFD9A8',
  },
  lanternBodyMine: {
    borderColor: '#fff',
  },
});
