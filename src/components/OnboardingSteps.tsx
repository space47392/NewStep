import { Fragment } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { canRevisitStep, useOnboardingNav } from '../navigation/onboardingNav';
import { colors, light, spacing, radius, fontFamily } from '../constants/theme';

// The real first-run order (see AppNavigator): sign up → username → school
// → interests → "are you new?" + welcome. Drawn as a trail: finished steps
// are ticked (tap one to go back to it), the current step is lit, the rest
// are waiting.
const STEPS = ['Sign up', 'Username', 'School', 'Interests', 'Say hi'] as const;

type Props = {
  // Index into STEPS of the screen showing this.
  current: number;
  style?: StyleProp<ViewStyle>;
  // 'light' on the bright sign-up screen.
  tone?: 'dark' | 'light';
};

export default function OnboardingSteps({ current, style, tone = 'dark' }: Props) {
  const isLight = tone === 'light';
  const nav = useOnboardingNav();
  const idle = isLight ? light.border : colors.border;

  return (
    <View style={[styles.card, isLight && styles.cardLight, style]} accessibilityLabel={`Step ${current + 1} of ${STEPS.length}: ${STEPS[current]}`}>
      <View style={styles.track}>
        {STEPS.map((step, i) => {
          const done = i < current;
          const now = i === current;
          const tappable = !!nav && canRevisitStep(i, current);
          const dot = (
            <View style={[styles.dot, done && styles.dotDone, now && styles.dotNow, !done && !now && { borderColor: idle }]}>
              {done ? (
                <Ionicons name="checkmark" size={13} color={colors.onPrimary} />
              ) : (
                <Text style={[styles.dotText, now && styles.dotTextNow, !now && { color: isLight ? light.textLight : colors.textLight }]}>{i + 1}</Text>
              )}
            </View>
          );
          return (
            <Fragment key={step}>
              {i > 0 ? <View style={[styles.line, { backgroundColor: i <= current ? colors.primary : idle }]} /> : null}
              <View style={styles.dotWrap}>
              {tappable ? (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    nav!.goToStep(i);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Go back to ${step}`}
                >
                  {dot}
                </TouchableOpacity>
              ) : (
                dot
              )}
              </View>
            </Fragment>
          );
        })}
      </View>
      <View style={styles.labels}>
        {STEPS.map((step, i) => {
          const done = i < current;
          const now = i === current;
          const tappable = !!nav && canRevisitStep(i, current);
          return (
            <Text
              key={step}
              onPress={tappable ? () => nav!.goToStep(i) : undefined}
              style={[
                styles.label,
                isLight && styles.labelLight,
                done && (isLight ? styles.labelDoneLight : styles.labelDone),
                now && (isLight ? styles.labelNowLight : styles.labelNow),
              ]}
              numberOfLines={1}
            >
              {step}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const DOT = 24;

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  cardLight: {
    backgroundColor: light.surface,
    borderWidth: 1,
    borderColor: light.hairline,
  },
  // The labels are five equal columns, so their centres sit at 10%, 30% … 90%.
  // The track spans 10%–90% and each dot takes no layout width (negative
  // margins), so the four equal lines put every dot on a label's centre.
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: '10%',
    height: DOT + 4,
  },
  dotWrap: {
    marginHorizontal: -DOT / 2,
    zIndex: 1,
  },
  line: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    marginHorizontal: DOT / 2 + 3,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dotNow: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
    transform: [{ scale: 1.15 }],
  },
  dotText: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
  },
  dotTextNow: {
    fontFamily: fontFamily.bold,
    color: colors.primaryDark,
  },
  labels: {
    flexDirection: 'row',
    marginTop: 6,
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: colors.textLight,
  },
  labelLight: {
    color: light.textLight,
  },
  labelDone: {
    color: colors.textMid,
  },
  labelDoneLight: {
    color: light.textMid,
  },
  labelNow: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: colors.primaryDark,
  },
  labelNowLight: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: light.link,
  },
});
