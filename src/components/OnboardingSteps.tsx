import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, light, spacing, radius, fontFamily } from '../constants/theme';

// The real first-run order (see AppNavigator): sign up → username → school
// → interests → "are you new?" + welcome. Footprints, not the help tracker's
// dots — those stay reserved for help requests.
const STEPS = ['Sign up', 'Username', 'School', 'Interests', 'Say hi 👋'] as const;

type Props = {
  // Index into STEPS of the screen showing this.
  current: number;
  style?: StyleProp<ViewStyle>;
  // 'light' on the bright sign-up screen.
  tone?: 'dark' | 'light';
};

export default function OnboardingSteps({ current, style, tone = 'dark' }: Props) {
  const isLight = tone === 'light';
  return (
    <View
      style={[styles.row, isLight && styles.rowLight, style]}
      accessible
      accessibilityLabel={`Step ${current + 1} of ${STEPS.length}: ${STEPS[current]}`}
    >
      {STEPS.map((step, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <View key={step} style={styles.step}>
            <Ionicons
              name="footsteps"
              size={now ? 20 : 16}
              color={now || done ? colors.primary : isLight ? light.border : colors.tabInactive}
              style={{ opacity: done ? 0.45 : 1, transform: [{ rotate: i % 2 === 0 ? '-12deg' : '12deg' }] }}
            />
            <Text
              style={[
                styles.label,
                isLight && styles.labelLight,
                now && styles.labelNow,
                now && isLight && styles.labelNowLight,
                done && (isLight ? styles.labelDoneLight : styles.labelDone),
              ]}
              numberOfLines={1}
            >
              {step}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
  },
  rowLight: {
    backgroundColor: light.surface,
    borderWidth: 1,
    borderColor: light.hairline,
  },
  step: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: colors.textLight,
  },
  labelNow: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: colors.primary,
  },
  labelDone: {
    color: colors.textMid,
  },
  labelLight: {
    color: light.textLight,
  },
  labelNowLight: {
    color: light.link,
  },
  labelDoneLight: {
    color: light.textMid,
  },
});
