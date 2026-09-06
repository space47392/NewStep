import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProfileById, setMyInterests } from '../../lib/profile';
import IconInput from '../../components/IconInput';
import PrimaryButton from '../../components/PrimaryButton';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';

const MAX_INTERESTS = 5;

// A curated starting set, not a second taxonomy — these are just ordinary
// strings written into the same profiles.interests text[] column free-text
// entry always used. Grouped purely for browsability.
const INTEREST_GROUPS: { title: string; items: string[] }[] = [
  {
    title: 'Hobbies',
    items: [
      'Basketball', 'Soccer', 'Gaming', 'Music', 'Guitar', 'Art', 'Reading',
      'Photography', 'Movies', 'Cooking', 'Fitness', 'Swimming', 'Travel',
    ],
  },
  {
    title: 'Academic & Tech',
    items: ['Coding', 'Computer Science', 'Technology', 'Science', 'Biology', 'Chemistry', 'Physics', 'Math', 'Writing'],
  },
];

type Props = {
  // Same onDone-driven pattern as ChooseSchoolScreen's onboarding mode —
  // AppNavigator swaps this screen out once called, whether the user picked
  // interests or skipped straight through.
  onDone: () => void;
};

// Onboarding interest picker (Step 25.1) — a curated, tappable grid replaces
// the original free-text entry, but the underlying data is untouched:
// profiles.interests stays a plain text[], so any legacy custom value a
// profile already has (free-typed via the old onboarding screen or
// EditProfileScreen, which is unaffected by this change) loads in here,
// shows in the Selected list below, and is preserved on save even though it
// has no matching grid chip. Nothing here can silently drop it — it's only
// ever removed by the user explicitly tapping it in Selected.
export default function ChooseInterestsScreen({ onDone }: Props) {
  const { user } = useAuth();
  const [interests, setInterests] = useState<string[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [search, setSearch] = useState('');
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

  const atLimit = interests.length >= MAX_INTERESTS;

  const toggleInterest = (item: string) => {
    setInterests((prev) => {
      if (prev.includes(item)) return prev.filter((i) => i !== item);
      if (prev.length >= MAX_INTERESTS) return prev;
      return [...prev, item];
    });
  };

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

  const query = search.trim().toLowerCase();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <FadeInView style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="sparkles" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>Choose your interests</Text>
          <Text style={styles.subtitle}>Pick up to {MAX_INTERESTS}. Optional — you can change these anytime.</Text>

          <IconInput
            icon="search-outline"
            style={styles.searchInput}
            placeholder="Search interests..."
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />

          {INTEREST_GROUPS.map((group) => {
            const filtered = query ? group.items.filter((item) => item.toLowerCase().includes(query)) : group.items;
            if (filtered.length === 0) return null;
            return (
              <View key={group.title} style={styles.group}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <View style={styles.chipRow}>
                  {filtered.map((item) => {
                    const selected = interests.includes(item);
                    const disabled = !selected && atLimit;
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.optionChip, selected && styles.optionChipSelected, disabled && styles.optionChipDisabled]}
                        onPress={() => toggleInterest(item)}
                        disabled={disabled}
                      >
                        {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                        <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>{item}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {interests.length > 0 && (
            <View style={styles.group}>
              <Text style={styles.groupTitle}>
                Selected ({interests.length}/{MAX_INTERESTS})
              </Text>
              <View style={styles.chipRow}>
                {interests.map((interest) => (
                  <TouchableOpacity key={interest} style={styles.selectedChip} onPress={() => toggleInterest(interest)}>
                    <Ionicons name="checkmark" size={13} color="#fff" />
                    <Text style={styles.selectedChipText}>{interest}</Text>
                    <Ionicons name="close" size={13} color="#fff" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

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
  searchInput: {
    marginBottom: spacing.lg,
  },
  group: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  groupTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
    marginBottom: spacing.sm,
  },
  chipRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionChipDisabled: {
    opacity: 0.4,
  },
  optionChipText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  optionChipTextSelected: {
    color: '#fff',
    fontFamily: fontFamily.semibold,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectedChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: '#fff',
  },
  button: {
    width: '100%',
    marginTop: spacing.sm,
  },
});
