import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { checkUsernameAvailable, setMyUsername } from '../../lib/username';
import { normalizeUsername, validateUsername } from '../../lib/usernameValidation';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';

const DEBOUNCE_MS = 400;

type Status = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

type Props = {
  // Called right after a successful save, in addition to refreshUsername() —
  // lets AppNavigator know a brand-new signup just finished this step, so it
  // can offer the school-onboarding screen next (see AppNavigator.tsx).
  onComplete?: () => void;
};

export default function ChooseUsernameScreen({ onComplete }: Props) {
  const { user, refreshUsername } = useAuth();
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const normalized = normalizeUsername(input);
    if (!normalized) {
      setStatus('idle');
      setErrorMessage(null);
      return;
    }

    const formatResult = validateUsername(normalized);
    if (!formatResult.valid) {
      setStatus('invalid');
      setErrorMessage(formatResult.reason);
      return;
    }

    setStatus('checking');
    setErrorMessage(null);
    debounceRef.current = setTimeout(async () => {
      try {
        const available = await checkUsernameAvailable(normalized);
        setStatus(available ? 'available' : 'taken');
        if (!available) setErrorMessage('That username is already taken.');
      } catch {
        setStatus('idle');
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input]);

  const handleSubmit = async () => {
    if (!user || status !== 'available') return;

    setSaving(true);
    try {
      const normalized = normalizeUsername(input);
      await setMyUsername(user.id, normalized);
      await refreshUsername();
      onComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save username.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const statusIcon =
    status === 'checking' ? (
      <ActivityIndicator size="small" color={colors.textMid} />
    ) : status === 'available' ? (
      <Ionicons name="checkmark-circle" size={20} color={colors.success} />
    ) : status === 'taken' || status === 'invalid' ? (
      <Ionicons name="close-circle" size={20} color={colors.error} />
    ) : null;

  return (
    <View style={styles.container}>
      <FadeInView style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="at" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>Choose a username</Text>
        <Text style={styles.subtitle}>This is how other students will find and mention you.</Text>

        <View style={styles.inputWrap}>
          <Text style={styles.atSign}>@</Text>
          <TextInput
            style={styles.input}
            placeholder="username"
            placeholderTextColor={colors.textLight}
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            maxLength={20}
          />
          {statusIcon}
        </View>

        <Text style={styles.hint}>3–20 characters: lowercase letters, numbers, periods, and underscores.</Text>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <PrimaryButton
          title="Continue"
          onPress={handleSubmit}
          loading={saving}
          disabled={status !== 'available'}
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
    marginBottom: spacing.xl,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  atSign: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textMid,
    marginRight: 2,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  hint: {
    width: '100%',
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.sm,
  },
  errorText: {
    width: '100%',
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.error,
    marginTop: spacing.xs,
  },
  button: {
    width: '100%',
    marginTop: spacing.xl,
  },
});
