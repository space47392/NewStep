import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProfileById, setMyInterests } from '../../lib/profile';
import InterestPicker from '../../components/InterestPicker';
import PrimaryButton from '../../components/PrimaryButton';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { MAX_INTERESTS } from '../../constants/interests';

type Props = {
  // Same onDone-driven pattern as ChooseSchoolScreen's onboarding mode —
  // AppNavigator swaps this screen out once called, whether the user picked
  // interests or skipped straight through.
  onDone: () => void;
};

// Onboarding interest picker (Step 25.1) — renders the shared InterestPicker
// (search + curated grid + Selected summary, same one EditProfileScreen
// uses) inside this screen's own loading/save/skip flow. profiles.interests
// stays a plain text[], so any legacy custom value a profile already has
// loads in here, shows in Selected, and is preserved on save even though it
// has no matching grid chip — see InterestPicker's own comment.
export default function ChooseInterestsScreen({ onDone }: Props) {
  const { user } = useAuth();
  const [interests, setInterests] = useState<string[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoadingProfile(false);
      return;
    }
    fetchProfileById(user.id)
      .then((profile) => setInterests(profile.interests ?? []))
      .catch(() => {
        // Non-critical — the picker still works fine starting from empty.
      })
      .finally(() => setLoadingProfile(false));
  }, [user]);

  const handleContinue = async () => {
    if (!user || interests.length === 0) {
      onDone();
      return;
    }
    setSaving(true);
    try {
      await setMyInterests(user.id, interests);
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save your interests.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  if (loadingProfile) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <FadeInView style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="sparkles" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>Choose your interests</Text>
          <Text style={styles.subtitle}>Pick up to {MAX_INTERESTS}. Optional — you can change these anytime.</Text>

          <InterestPicker value={interests} onChange={setInterests} />

          <PrimaryButton
            title={interests.length > 0 ? 'Continue' : 'Skip for now'}
            onPress={handleContinue}
            loading={saving}
            style={styles.button}
          />
        </FadeInView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
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
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
  button: {
    width: '100%',
    marginTop: spacing.sm,
  },
});
