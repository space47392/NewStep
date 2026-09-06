import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { setMyInterests } from '../../lib/profile';
import IconInput from '../../components/IconInput';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';

const MAX_INTERESTS = 5;

type Props = {
  // Same onDone-driven pattern as ChooseSchoolScreen's onboarding mode —
  // AppNavigator swaps this screen out once called, whether the user added
  // interests or skipped straight through.
  onDone: () => void;
};

// Onboarding-only slice of EditProfileScreen's interests editor — same
// free-text chip pattern and the same profiles.interests column (no second
// taxonomy, no new schema), just capped smaller and always skippable. Exists
// so School Community's "students with similar interests" discovery has
// something to match on from day one, instead of waiting for someone to
// separately visit Edit Profile later — which most new users never do.
export default function ChooseInterestsScreen({ onDone }: Props) {
  const { user } = useAuth();
  const [interests, setInterests] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  const atLimit = interests.length >= MAX_INTERESTS;

  const handleAdd = () => {
    const trimmed = input.trim();
    if (!trimmed || atLimit || interests.includes(trimmed)) {
      setInput('');
      return;
    }
    setInterests((prev) => [...prev, trimmed]);
    setInput('');
  };

  const handleRemove = (interest: string) => {
    setInterests((prev) => prev.filter((i) => i !== interest));
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

  return (
    <View style={styles.container}>
      <FadeInView style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="sparkles" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>What are you into?</Text>
        <Text style={styles.subtitle}>
          Add up to {MAX_INTERESTS} interests to help other students at your school find you. Optional — you can
          change these anytime from your profile.
        </Text>

        <View style={styles.inputRow}>
          <IconInput
            icon="add-circle-outline"
            style={styles.input}
            placeholder={atLimit ? `Up to ${MAX_INTERESTS} added` : 'e.g. Basketball'}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
            editable={!atLimit}
          />
          <TouchableOpacity
            style={[styles.addButton, atLimit && styles.addButtonDisabled]}
            onPress={handleAdd}
            disabled={atLimit}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {interests.length > 0 && (
          <View style={styles.chipRow}>
            {interests.map((interest) => (
              <TouchableOpacity key={interest} style={styles.chip} onPress={() => handleRemove(interest)}>
                <Text style={styles.chipText}>{interest} ✕</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <PrimaryButton
          title={interests.length > 0 ? 'Continue' : 'Skip for now'}
          onPress={handleContinue}
          loading={saving}
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
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.xl,
  },
  inputRow: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  input: {
    flex: 1,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  chipRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  chip: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: '#fff',
  },
  button: {
    width: '100%',
    marginTop: spacing.xl,
  },
});
