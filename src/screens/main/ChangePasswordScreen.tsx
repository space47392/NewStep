import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import IconInput from '../../components/IconInput';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import { warmAlert } from '../../components/WarmAlert';
import { colors, spacing, fontSize, fontFamily, typography } from '../../constants/theme';

const MIN_PASSWORD_LENGTH = 6;

// Settings → Change password, while signed in. Asks for the current password
// first, so a phone left unlocked can't be used to take over the account.
export default function ChangePasswordScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const handleSave = async () => {
    if (savingRef.current || !user?.email) return;
    if (!current) {
      warmAlert('Current password', 'Type the password you use now.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      warmAlert('Too short', `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      warmAlert("Passwords don't match", 'Type the same new password in both boxes.');
      return;
    }
    if (password === current) {
      warmAlert('Same as before', 'Pick a password that’s different from your current one.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const { error: checkError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (checkError) {
        warmAlert('That’s not your current password', 'Check it and try again — or log out and use “Forgot password?”.');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        warmAlert("Couldn't update your password", error.message);
        return;
      }
      showToast('Password updated 🔑');
      navigation.goBack();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <FadeInView>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} disabled={saving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={20} color={colors.textDark} accessibilityLabel="Back" />
          </TouchableOpacity>
          <Text style={styles.title}>Change password</Text>
          <Text style={styles.intro}>For {user?.email}</Text>
        </FadeInView>

        <FadeInView style={styles.form} delay={40}>
          <Text style={styles.label}>Current password</Text>
          <IconInput icon="lock-closed-outline" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" placeholder="The one you use now" />

          <Text style={styles.label}>New password</Text>
          <IconInput icon="key-outline" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} />

          <Text style={styles.label}>Confirm new password</Text>
          <IconInput icon="key-outline" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" placeholder="Type it again" />
          {confirm.length > 0 && (
            <Text style={[styles.matchHint, password === confirm ? styles.matchOk : styles.matchBad]}>
              {password === confirm ? '✓ Passwords match' : "Passwords don't match yet"}
            </Text>
          )}

          <PrimaryButton title="Update password" onPress={handleSave} loading={saving} style={styles.button} />
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.largeTitle,
    color: colors.textDark,
  },
  intro: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textMid,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
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
  matchHint: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    marginTop: -2,
  },
  matchOk: {
    color: colors.successSolid,
  },
  matchBad: {
    color: colors.error,
  },
  button: {
    marginTop: spacing.lg,
  },
});
