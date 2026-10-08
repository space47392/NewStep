import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { fetchSchoolSky, skyMood, SkyStar } from '../lib/sky';
import { fetchBlockedUserIds } from '../lib/blocks';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

// The School Sky's doorway on Home: a few of today's mood stars and a way
// in. Lives inside the night-sky header, so it's styled for a dark card.
type Props = {
  userId: string;
  onOpen: (openComposer: boolean) => void;
};

export default function SkyPeek({ userId, onOpen }: Props) {
  const [stars, setStars] = useState<SkyStar[] | null>(null);

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

  // Same height while loading, so the Home list doesn't jump when it arrives.
  if (stars === null) {
    return (
      <View style={[styles.row, styles.rowLoading]}>
        <Text style={styles.moon}>🌙</Text>
        <Text style={styles.text}>School Sky</Text>
        <View style={[styles.cta, styles.ctaGhost]}>
          <Text style={styles.ctaText}> </Text>
        </View>
      </View>
    );
  }
  const mine = stars.find((s) => s.user_id === userId) ?? null;
  const others = stars.filter((s) => s.user_id !== userId);
  const shown = (mine ? [mine, ...others] : others).slice(0, 5);

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.85}
      onPress={() => onOpen(!mine && others.length === 0)}
      accessibilityRole="button"
      accessibilityLabel="Open School Sky"
    >
      {shown.length > 0 ? (
        <View style={styles.bubbles}>
          {shown.map((s, i) => (
            <View
              key={s.user_id}
              style={[styles.bubble, { borderColor: skyMood(s.mood).color, marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }]}
            >
              <Text style={styles.bubbleEmoji}>{skyMood(s.mood).emoji}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.moon}>🌙</Text>
      )}
      <Text style={styles.text} numberOfLines={1}>
        {others.length > 0
          ? `${others.length} ${others.length === 1 ? 'classmate' : 'classmates'} in the sky today`
          : mine
            ? 'Your star is up today'
            : 'Be the first star today'}
      </Text>
      <View style={styles.cta}>
        <Text style={styles.ctaText}>{mine ? 'See' : 'Add star'}</Text>
        <Ionicons name="sparkles" size={12} color={colors.ink} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  rowLoading: {
    opacity: 0.6,
  },
  ctaGhost: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    width: 72,
  },
  bubbles: {
    flexDirection: 'row',
  },
  bubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    backgroundColor: colors.night,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleEmoji: {
    fontSize: 13,
  },
  moon: {
    fontSize: 18,
    marginLeft: 4,
  },
  text: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: '#fff',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.sticker.yellow,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ctaText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    color: colors.ink,
  },
});
