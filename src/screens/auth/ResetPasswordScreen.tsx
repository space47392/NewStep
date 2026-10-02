import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import IconInput from '../../components/IconInput';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';

const MIN_PASSWORD_LENGTH = 6;

type Props = {
  // Called once the new password is saved (the student stays signed in) or
  // they cancel (signed out). AppNavigator then shows whatever comes next.
  onDone: () => void;
};

// Opened from the "Forgot password?" email link (newstep://reset-password —
// see AppNavigator). By the time this shows, that link's one-time recovery
// session is already active, so updateUser() is allowed to set a new password.
export default function ResetPasswordScreen({ onDone }: Props) {
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const handleSave = async () => {
    if (savingRef.current) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert('Too short', `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords don't match", 'Type the same new password in both boxes.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    savingRef.current = false;
    setSaving(false);
    if (error) {
      Alert.alert("Couldn't update your password", error.message);
      return;
    }
    Alert.alert('Password updated 🔑', "You're all set — you're signed in with your new password.");
    onDone();
  };

  const handleCancel = async () => {
    // Don't leave a half-used recovery session signed in.
    await supabase.auth.signOut().catch(() => {});
    onDone();
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <FadeInView style={styles.header}>
          <View style={styles.logoBadge}>
            <Ionicons name="key" size={30} color={colors.primary} />
          </View>
          <Text style={styles.title}>Choose a new password</Text>
          {/* Shows which account this is for, so a link never quietly
              resets the wrong one. */}
          {session?.user.email ? (
            <Text style={styles.tagline}>
              For <Text style={styles.email}>{session.user.email}</Text>
            </Text>
          ) : null}
        </FadeInView>

        <FadeInView style={styles.form} delay={80}>
          <Text style={styles.label}>New password</Text>
          <IconInput
            icon="lock-closed-outline"
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />
          <Text style={styles.label}>Type it again</Text>
          <IconInput
            icon="lock-closed-outline"
            placeholder="Same password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
          />
          <PrimaryButton title="Save new password" onPress={handleSave} loading={saving} style={styles.button} />
        </FadeInView>

        <TouchableOpacity
          style={styles.cancel}
          onPress={handleCancel}
          disabled={saving}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.warningLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  email: {
    fontFamily: fontFamily.semibold,
    color: colors.textDark,
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
    marginTop: spacing.sm,
  },
  button: {
    marginTop: spacing.lg,
  },
  cancel: {
    alignSelf: 'center',
    marginTop: spacing.xl,
  },
  cancelText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
});
