import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import FadeInView from './FadeInView';
import PressableScale from './PressableScale';
import { firstWeekProgress, type FirstWeekStatus } from '../lib/firstWeek';
import { fetchFirstWeekStatus } from '../lib/firstWeekApi';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

// Home's "your first week" row for new students: how far along they are and
// the next small step. Hides itself once everything's done, if it can't load
// (e.g. before first_week.sql is run), or when dismissed.
export default function FirstWeekCard({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  const [status, setStatus] = useState<FirstWeekStatus | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchFirstWeekStatus()
        .then((s) => alive && setStatus(s))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [])
  );

  if (!status) return null;
  const p = firstWeekProgress(status);
  if (p.complete) return null;

  return (
    <FadeInView>
      <PressableScale style={styles.card} pressedScale={0.98} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Your first week, ${p.done} of ${p.total} done`}>
        <Text style={styles.emoji}>🌱</Text>
        <View style={styles.text}>
          <Text style={styles.title}>
            Your first week <Text style={styles.count}>· {p.done}/{p.total}</Text>
          </Text>
          {p.next ? (
            <Text style={styles.next} numberOfLines={1}>
              Next: {p.next.title}
            </Text>
          ) : null}
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(p.done / p.total) * 100}%` }]} />
          </View>
        </View>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Hide your first week">
          <Ionicons name="close" size={16} color={colors.textLight} />
        </TouchableOpacity>
      </PressableScale>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  emoji: {
    fontSize: 26,
  },
  text: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  count: {
    fontFamily: fontFamily.medium,
    color: colors.primaryDark,
  },
  next: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 2,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.xs + 2,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
});
