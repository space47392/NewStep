import { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { setIsNewStudent } from '../../lib/profile';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';

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
        <View style={styles.iconCircle}>
          <Ionicons name="school" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>Are you new to this school?</Text>
        <Text style={styles.subtitle}>
          We'll help you find your community, school stories, and people to meet — no pressure either way.
        </Text>

        <PrimaryButton
          title="Yes, I'm new"
          icon="sparkles-outline"
          onPress={() => handleChoice(true)}
          loading={pendingChoice === true}
          disabled={pendingChoice !== null}
          style={styles.button}
        />
        <PrimaryButton
          title="Not right now"
          variant="outline"
          onPress={() => handleChoice(false)}
          loading={pendingChoice === false}
          disabled={pendingChoice !== null}
          style={styles.button}
        />
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
  button: {
    width: '100%',
    marginTop: spacing.sm,
  },
});
