import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useToast } from '../../contexts/ToastContext';
import FadeInView from '../../components/FadeInView';
import ConfettiBurst from '../../components/ConfettiBurst';
import ErrorState from '../../components/ErrorState';
import { firstWeekProgress, type FirstWeekStatus, type FirstWeekStepKey, type ManualStep } from '../../lib/firstWeek';
import { fetchFirstWeekStatus, setFirstWeekStep } from '../../lib/firstWeekApi';
import { errorMessage } from '../../lib/errors';
import { colors, spacing, radius, fontSize, fontFamily, typography } from '../../constants/theme';
import { MainStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<MainStackParamList>;

// Where each step that the app can help with takes you.
function openStep(navigation: Nav, key: FirstWeekStepKey) {
  switch (key) {
    case 'profile':
      return navigation.navigate('EditProfile');
    case 'guide':
      return navigation.navigate('SchoolGuide');
    case 'buddy':
      return navigation.navigate('Buddy');
    case 'hello':
      return navigation.navigate('Tabs', { screen: 'Search' });
    case 'ask':
      return navigation.navigate('CreatePost', { prefillCategory: 'School Question' });
    case 'star':
      return navigation.navigate('SchoolSky', { openComposer: true });
    default:
      return undefined;
  }
}

// "Your first week": small steps for a new student, most of which tick
// themselves as they use the app. No streaks, no pressure.
export default function FirstWeekScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [status, setStatus] = useState<FirstWeekStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [confetti, setConfetti] = useState(0);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchFirstWeekStatus());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // Back from another screen (a buddy found, a star lit): re-check.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const progress = firstWeekProgress(status);

  const toggleManual = async (key: ManualStep, done: boolean) => {
    if (!status) return;
    const before = status;
    const manual = done ? [...status.manual, key] : status.manual.filter((k) => k !== key);
    const next = { ...status, manual };
    setStatus(next);
    Haptics.selectionAsync().catch(() => {});
    if (done && firstWeekProgress(next).complete) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setConfetti((k) => k + 1);
    }
    try {
      await setFirstWeekStep(key, done);
    } catch (err) {
      setStatus(before);
      showToast(errorMessage(err, "Couldn't save that — try again"));
    }
  };

  if (failed && !status) {
    return <ErrorState title="Couldn't load your first week" subtitle="Check your connection and try again." onRetry={load} />;
  }

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: spacing.xxl + insets.bottom }]}>
        <FadeInView>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={20} color={colors.textDark} />
          </TouchableOpacity>
          <Text style={styles.title}>Your first week</Text>
          <Text style={styles.intro}>Small steps, in any order. No rush — most of these tick themselves as you go.</Text>
        </FadeInView>

        {!status ? (
          <ActivityIndicator color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <View style={styles.progressRow} accessible accessibilityLabel={`${progress.done} of ${progress.total} done`}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(progress.done / progress.total) * 100}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {progress.done}/{progress.total}
              </Text>
            </View>

            {progress.complete ? (
              <FadeInView style={styles.doneCard}>
                <Text style={styles.doneEmoji}>🌱</Text>
                <Text style={styles.doneTitle}>You made it through your first week</Text>
                <Text style={styles.doneSub}>That took courage. This place is a little more yours now 💛</Text>
              </FadeInView>
            ) : null}

            {progress.steps.map((step, i) => {
              const manual = step.kind === 'manual' && step.key !== 'guide';
              const onPress = manual ? () => toggleManual(step.key as ManualStep, !step.done) : () => openStep(navigation, step.key);
              return (
                <FadeInView key={step.key} delay={i * 30}>
                  <TouchableOpacity
                    style={[styles.step, step.done && styles.stepDone]}
                    activeOpacity={0.85}
                    onPress={onPress}
                    accessibilityRole={manual ? 'checkbox' : 'button'}
                    accessibilityState={manual ? { checked: step.done } : undefined}
                  >
                    <View style={[styles.check, step.done && styles.checkOn]}>
                      {step.done ? <Ionicons name="checkmark" size={16} color={colors.onPrimary} /> : null}
                    </View>
                    <View style={styles.stepText}>
                      <Text style={[styles.stepTitle, step.done && styles.stepTitleDone]}>{step.title}</Text>
                      {!step.done ? <Text style={styles.stepHint}>{step.hint}</Text> : null}
                    </View>
                    {!manual && !step.done ? <Ionicons name="chevron-forward" size={18} color={colors.textLight} /> : null}
                  </TouchableOpacity>
                </FadeInView>
              );
            })}
            <Text style={styles.footnote}>Tap the ones you do in person to tick them.</Text>
          </>
        )}
      </ScrollView>
      <ConfettiBurst trigger={confetti} />
    </View>
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
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  progressTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  progressText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    minWidth: 32,
    textAlign: 'right',
  },
  doneCard: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
    marginBottom: spacing.lg,
  },
  doneEmoji: {
    fontSize: 36,
  },
  doneTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  doneSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  stepDone: {
    backgroundColor: colors.background,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepText: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  stepTitleDone: {
    color: colors.textMid,
  },
  stepHint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 19,
    color: colors.textMid,
    marginTop: 2,
  },
  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
