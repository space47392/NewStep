import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProfileById } from '../../lib/profile';
import PrimaryButton from '../../components/PrimaryButton';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';

type Props = {
  // Same onDone pattern as ChooseSchool/ChooseInterests — AppNavigator swaps
  // this out for Main once called. This is the terminal onboarding step: no
  // skip vs. complete distinction, just "Enter NewStep."
  onDone: () => void;
};

// Shown exactly once, right after a brand-new signup finishes (or skips)
// School and Interests — see AppNavigator. Deliberately just one screen, one
// read, one button: the goal is a 30-second first impression, not a
// tutorial. Distinct from FeedScreen's own "New Student" banner (which is
// ongoing and only for is_new_student === true) — this appears once for
// EVERY brand-new signup regardless of that choice, so there's no overlap or
// duplicate messaging between the two.
export default function WelcomeScreen({ onDone }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [schoolName, setSchoolName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchProfileById(user.id)
      .then((profile) => setSchoolName(profile.school_name))
      .catch(() => {
        // Non-critical — the screen still works fine without school context.
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) {
    return <LoadingScreen />;
  }

  const hasSchool = !!schoolName;

  return (
    <View style={styles.container}>
      <FadeInView style={styles.content}>
        <Text style={styles.title}>Welcome to NewStep 👋</Text>

        {hasSchool ? (
          <Text style={styles.schoolLine}>🏫 {schoolName}</Text>
        ) : (
          <Text style={styles.subtitle}>You can add your school anytime from your profile.</Text>
        )}

        <View style={styles.actionList}>
          <View style={styles.actionRow}>
            <Text style={styles.actionIcon}>🏫</Text>
            <Text style={styles.actionText}>
              {hasSchool ? "Discover what's happening at your school" : 'Discover what other students are up to'}
            </Text>
          </View>
          <View style={styles.actionRow}>
            <Text style={styles.actionIcon}>👋</Text>
            <Text style={styles.actionText}>Meet people {hasSchool ? 'at your school' : 'on NewStep'}</Text>
          </View>
          <View style={styles.actionRow}>
            <Text style={styles.actionIcon}>🤝</Text>
            <Text style={styles.actionText}>Ask for or offer help</Text>
          </View>
        </View>

        <PrimaryButton title="Enter NewStep" icon="arrow-forward" onPress={onDone} style={styles.button} />
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
  title: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
    textAlign: 'center',
  },
  schoolLine: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  actionList: {
    width: '100%',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionIcon: {
    fontSize: 20,
  },
  actionText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  button: {
    width: '100%',
    marginTop: spacing.xl,
  },
});
