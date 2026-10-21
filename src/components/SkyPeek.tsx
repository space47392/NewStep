import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { fetchSchoolSky, skyMood, SkyStar } from '../lib/sky';
import { fetchBlockedUserIds } from '../lib/blocks';
import { colors, spacing, fontSize, fontFamily } from '../constants/theme';

// The School Sky's doorway on Home: a little strip of tonight's sky where
// each classmate's star twinkles in their mood colour, and a glowing star
// button to light your own. Lives inside the night-sky header (dark card).
type Props = {
  userId: string;
  onOpen: (openComposer: boolean) => void;
};

const SPARKLE = 'M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z';
// Where the stars sit in the strip (fractions), so it looks scattered.
const SPOTS = [
  [0.08, 0.55], [0.22, 0.2], [0.36, 0.62], [0.5, 0.28], [0.64, 0.66], [0.78, 0.22], [0.92, 0.58],
];
const STRIP_W = 112;
const STRIP_H = 36;

function TwinkleStar({ x, y, color, size, delay }: { x: number; y: number; color: string; size: number; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t, delay]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x * STRIP_W - size / 2,
        top: y * STRIP_H - size / 2,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) }],
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={SPARKLE} fill={color} />
      </Svg>
    </Animated.View>
  );
}

export default function SkyPeek({ userId, onOpen }: Props) {
  const [stars, setStars] = useState<SkyStar[] | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([fetchSchoolSky(30), fetchBlockedUserIds(userId).catch(() => new Set<string>())])
        .then(([sky, blocked]) => {
          if (!cancelled) setStars(sky.filter((s) => !blocked.has(s.user_id)));
        })
        .catch(() => {
          // Table not set up yet, or offline — the row just shows its
          // invitation without stars.
          if (!cancelled) setStars([]);
        });
      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  const mine = stars?.find((s) => s.user_id === userId) ?? null;
  const others = stars?.filter((s) => s.user_id !== userId) ?? [];

  // Your empty star breathes softly until you light it.
  useEffect(() => {
    if (mine) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [mine, pulse]);

  const shown = (mine ? [mine, ...others] : others).slice(0, SPOTS.length);
  const title =
    stars === null
      ? 'School Sky'
      : others.length > 0
        ? `${others.length} ${others.length === 1 ? 'classmate' : 'classmates'} lit the sky`
        : mine
          ? 'Your star is up tonight'
          : 'Light the first star';
  const sub = mine ? `Feeling ${skyMood(mine.mood).label.toLowerCase()} · tap to see the sky` : 'How is today, really? Add your star';

  return (
    <View style={[styles.row, stars === null && styles.rowLoading]}>
      <TouchableOpacity
        style={styles.left}
        activeOpacity={0.85}
        onPress={() => onOpen(false)}
        accessibilityRole="button"
        accessibilityLabel="Open School Sky"
      >
        <View style={styles.strip}>
          {shown.length > 0
            ? shown.map((s, i) => (
                <TwinkleStar
                  key={s.user_id}
                  x={SPOTS[i][0]}
                  y={SPOTS[i][1]}
                  size={s.user_id === userId ? 15 : 11}
                  color={skyMood(s.mood).color}
                  delay={i * 260}
                />
              ))
            : SPOTS.map(([x, y], i) => (
                <TwinkleStar key={i} x={x} y={y} size={i % 3 === 0 ? 9 : 6} color="rgba(255,255,255,0.55)" delay={i * 300} />
              ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => onOpen(!mine)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={mine ? 'See your star' : 'Add your star'}
        style={styles.starButtonWrap}
      >
        {!mine ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.starGlow,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.25] }) }],
              },
            ]}
          />
        ) : null}
        <View style={[styles.starButton, mine && styles.starButtonMine]}>
          {mine ? (
            <Text style={styles.mineEmoji}>{skyMood(mine.mood).emoji}</Text>
          ) : (
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path d={SPARKLE} fill={colors.onPrimary} />
            </Svg>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  rowLoading: {
    opacity: 0.6,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  strip: {
    width: STRIP_W,
    height: STRIP_H,
    borderRadius: 12,
    backgroundColor: 'rgba(10,8,30,0.45)',
    overflow: 'hidden',
  },
  dot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: '#fff',
  },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.7)',
  },
  starButtonWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starGlow: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
  },
  starButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starButtonMine: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  mineEmoji: {
    fontSize: 18,
  },
});
