import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProfileById, PublicProfile } from '../../lib/profile';
import { fetchSchoolById } from '../../lib/schools';
import StudentCard from '../../components/StudentCard';
import NSIcon from '../../components/NSIcon';
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
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchProfileById(user.id)
      .then(async (p) => {
        setProfile(p);
        // A directory pick only writes school_id (see setMySchool()), so the
        // name has to come from the schools table in that case.
        const directory = p.school_id ? await fetchSchoolById(p.school_id).catch(() => null) : null;
        setSchoolName(directory?.name ?? p.school_name);
      })
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
        <Text style={styles.subtitle}>
          {hasSchool ? "Here's your student card." : 'You can add your school anytime from your profile.'}
        </Text>

        {/* Built only from what was just filled in during signup — nothing
            here is invented, and empty fields simply don't show. */}
        <StudentCard
          name={profile?.full_name ?? null}
          avatarUri={profile?.avatar_url ?? null}
          schoolName={hasSchool ? schoolName : null}
          grade={profile?.grade ?? null}
          interests={profile?.interests ?? []}
          style={styles.card}
        />

        <View style={styles.actionList}>
          <View style={styles.actionRow}>
            <NSIcon name="school" size={26} />
            <Text style={styles.actionText}>
              {hasSchool ? "Discover what's happening at your school" : 'Discover what other students are up to'}
            </Text>
          </View>
          <View style={styles.actionRow}>
            <NSIcon name="wave" size={26} />
            <Text style={styles.actionText}>Meet people {hasSchool ? 'at your school' : 'on NewStep'}</Text>
          </View>
          <View style={styles.actionRow}>
            <NSIcon name="help" size={26} />
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
  card: {
    marginTop: spacing.xl,
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
    marginTop: spacing.lg,
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
