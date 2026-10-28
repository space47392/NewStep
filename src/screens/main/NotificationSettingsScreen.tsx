import { Fragment, useCallback, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import FadeInView from '../../components/FadeInView';
import ErrorState from '../../components/ErrorState';
import {
  isPaused,
  NOTIFICATION_CATEGORIES,
  pausedLabel,
  pauseUntil,
  toggleMuted,
  type NotificationPrefs,
  type PauseLength,
} from '../../lib/notificationPrefs';
import { fetchNotificationPrefs, saveNotificationPrefs } from '../../lib/notificationPrefsApi';
import { errorMessage } from '../../lib/errors';
import { colors, spacing, radius, fontSize, fontFamily, typography } from '../../constants/theme';

// Which notifications buzz the phone, and a way to take a quiet break.
// Everything still shows in the in-app Notifications list.
export default function NotificationSettingsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id;
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setPrefs(await fetchNotificationPrefs(userId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Optimistic: show the change at once, put it back if saving fails.
  const update = async (next: NotificationPrefs) => {
    if (!prefs) return;
    const before = prefs;
    setPrefs(next);
    Haptics.selectionAsync().catch(() => {});
    try {
      await saveNotificationPrefs(next);
    } catch (err) {
      setPrefs(before);
      showToast(errorMessage(err, "Couldn't save that — try again"));
    }
  };

  const pause = (length: PauseLength) => {
    if (!prefs) return;
    update({ ...prefs, paused_until: pauseUntil(length).toISOString() });
    showToast(length === 'hour' ? 'Quiet for an hour 🌙' : 'Quiet until the morning 🌙');
  };

  if (failed && !prefs) {
    return <ErrorState title="Couldn't load your settings" subtitle="Check your connection and try again." onRetry={load} />;
  }

  const paused = prefs ? isPaused(prefs) : false;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.container, { paddingBottom: spacing.xxl + insets.bottom }]}>
      <FadeInView>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color={colors.textDark} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.intro}>Choose what buzzes your phone. You'll still see everything in Notifications inside the app.</Text>
      </FadeInView>

      {!prefs ? (
        <ActivityIndicator color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
      ) : (
        <>
          <FadeInView delay={40}>
            <Text style={styles.groupLabel}>Take a break</Text>
            <View style={[styles.card, styles.pauseCard]}>
              {paused ? (
                <View style={styles.pausedRow}>
                  <Text style={styles.pauseEmoji}>🌙</Text>
                  <Text style={styles.pausedText}>{pausedLabel(prefs)}</Text>
                  <TouchableOpacity onPress={() => update({ ...prefs, paused_until: null })} style={styles.resume} accessibilityRole="button">
                    <Text style={styles.resumeText}>Resume</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.pauseHint}>Need some quiet? Pause every notification for a while.</Text>
                  <View style={styles.pauseButtons}>
                    <TouchableOpacity style={styles.pauseButton} onPress={() => pause('hour')} accessibilityRole="button">
                      <Text style={styles.pauseButtonText}>For an hour</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.pauseButton} onPress={() => pause('tomorrow')} accessibilityRole="button">
                      <Text style={styles.pauseButtonText}>Until tomorrow</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </FadeInView>

          <FadeInView delay={80}>
            <Text style={[styles.groupLabel, styles.groupGap]}>Notify me about</Text>
            <View style={[styles.card, paused && styles.dimmed]}>
              {NOTIFICATION_CATEGORIES.map((c, i) => {
                const on = !prefs.muted.includes(c.key);
                return (
                  <Fragment key={c.key}>
                    <View style={styles.row}>
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel}>{c.label}</Text>
                        <Text style={styles.rowHint}>{c.hint}</Text>
                      </View>
                      <Switch
                        value={on}
                        onValueChange={(v) => update(toggleMuted(prefs, c.key, v))}
                        trackColor={{ true: colors.primary, false: colors.border }}
                        thumbColor={colors.cardBg}
                        accessibilityLabel={c.label}
                      />
                    </View>
                    {i < NOTIFICATION_CATEGORIES.length - 1 ? <View style={styles.divider} /> : null}
                  </Fragment>
                );
              })}
            </View>
          </FadeInView>

          <TouchableOpacity style={styles.phoneLink} onPress={() => Linking.openSettings().catch(() => {})} accessibilityRole="button">
            <Ionicons name="phone-portrait-outline" size={16} color={colors.textMid} />
            <Text style={styles.phoneLinkText}>Phone notification settings</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.largeTitle,
    color: colors.textDark,
  },
  intro: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.textMid,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  groupLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  groupGap: {
    marginTop: spacing.lg,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  dimmed: {
    opacity: 0.55,
  },
  pauseCard: {
    padding: spacing.md,
  },
  pauseHint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  pauseButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  pauseButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  pauseButtonText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primaryDark,
  },
  pausedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pauseEmoji: {
    fontSize: 22,
  },
  pausedText: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  resume: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  resumeText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.onPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  rowHint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginLeft: spacing.md,
  },
  phoneLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  phoneLinkText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
});
