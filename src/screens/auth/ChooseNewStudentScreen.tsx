import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { setIsNewStudent } from '../../lib/profile';
import OnboardingSteps from '../../components/OnboardingSteps';
import FadeInView from '../../components/FadeInView';
import NSIcon from '../../components/NSIcon';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';

// One tap answers and moves on, same as the old two buttons.
const CHOICES = [
  {
    value: true,
    icon: 'backpack' as const,
    tilt: '-8deg',
    tint: colors.primaryLight,
    title: "Yes, I'm new",
    body: 'Show me people, stories and help to get started.',
  },
  {
    value: false,
    icon: 'school' as const,
    tilt: '6deg',
    tint: colors.accentLight,
    title: 'Not right now',
    body: "I know my way around — I'm here to help and hang out.",
  },
];

type Props = {
  // Same onDone-driven pattern as ChooseSchool/ChooseInterests — AppNavigator
  // swaps this screen out once called, whichever answer was given.
  onDone: () => void;
};

// Onboarding step (Step 29 audit fix) — asks the exact same question
// EditProfileScreen's existing New Student Mode toggle already asks, writes
// the same profiles.is_new_student column via the same meaning (null =
// unanswered, true/false = answered), just earlier in the flow. Not a new
// New Student Mode implementation: SchoolScreen/FeedScreen's existing
// is_new_student-gated behavior is untouched and picks this answer up the
// same way it already picks up an EditProfileScreen change.
export default function ChooseNewStudentScreen({ onDone }: Props) {
  const { user } = useAuth();
  // Tracks WHICH answer is in flight (not just a boolean) so only the
  // pressed button shows its own spinner, while the other stays disabled.
  const [pendingChoice, setPendingChoice] = useState<boolean | null>(null);

  const handleChoice = async (isNew: boolean) => {
    if (!user) {
      onDone();
      return;
    }
    setPendingChoice(isNew);
    try {
      await setIsNewStudent(user.id, isNew);
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save your answer.';
      Alert.alert('Error', message);
      setPendingChoice(null);
    }
  };

  return (
    <View style={styles.container}>
      <FadeInView style={styles.content}>
        <OnboardingSteps current={4} style={styles.steps} />
        <View style={styles.iconCircle}>
          <Ionicons name="school" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>Are you new to this school?</Text>
        <Text style={styles.subtitle}>
          We'll help you find your community, school stories, and people to meet — no pressure either way.
        </Text>

        {CHOICES.map((choice) => (
          <TouchableOpacity
            key={choice.title}
            style={[
              styles.choice,
              { backgroundColor: choice.tint },
              pendingChoice !== null && pendingChoice !== choice.value && styles.choiceDimmed,
            ]}
            activeOpacity={0.8}
            onPress={() => handleChoice(choice.value)}
            disabled={pendingChoice !== null}
            accessibilityRole="button"
            accessibilityLabel={`${choice.title}. ${choice.body}`}
          >
            <View style={{ transform: [{ rotate: choice.tilt }] }}>
              <NSIcon name={choice.icon} size={44} />
            </View>
            <View style={styles.choiceText}>
              <Text style={styles.choiceTitle}>{choice.title}</Text>
              <Text style={styles.choiceBody}>{choice.body}</Text>
            </View>
            {pendingChoice === choice.value ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            )}
          </TouchableOpacity>
        ))}
        <Text style={styles.footnote}>You can change this anytime in Edit Profile.</Text>
      </FadeInView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  content: {
    alignItems: 'center',
  },
  steps: {
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    color: colors.textDark,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.xl,
  },
  choice: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  choiceDimmed: {
    opacity: 0.5,
  },
  choiceEmoji: {
    fontSize: 34,
  },
  choiceText: {
    flex: 1,
  },
  choiceTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  choiceBody: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: 2,
    lineHeight: 16,
  },
  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.lg,
  },
});
