import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { warmAlert } from '../../components/WarmAlert';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import IconInput from '../../components/IconInput';
import PrimaryButton from '../../components/PrimaryButton';
import OnboardingSteps from '../../components/OnboardingSteps';
import FadeInView from '../../components/FadeInView';
import AppLogo from '../../components/AppLogo';
import BirthdayField, { Birthday, isAtLeast } from '../../components/BirthdayField';
import { LEGAL_UPDATED, MIN_AGE } from '../../constants/legal';
import { colors, spacing, radius, fontSize, fontFamily, light } from '../../constants/theme';
import { AuthStackParamList } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

export const EMAIL_CONFIRMED_URL = 'newstep://email-confirmed';

// Remembered on this device after a too-young answer, so going back and
// picking another year doesn't simply get around the check.
const UNDER_AGE_KEY = 'signup:under-age';

export default function RegisterScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Typed twice so a typo can't lock a brand-new account out of its own
  // password before the student has even signed in once.
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Synchronous re-entrancy guard — same reasoning as LoginScreen's
  // loggingInRef: `loading` state alone leaves a brief window for a rapid
  // double-tap to fire a second signUp() call before the button disables.
  const registeringRef = useRef(false);
  const [birthday, setBirthday] = useState<Birthday | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [tooYoung, setTooYoung] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(UNDER_AGE_KEY)
      .then((v) => setTooYoung(v === '1'))
      .catch(() => {});
  }, []);

  const pickBirthday = (b: Birthday) => {
    setBirthday(b);
    if (!isAtLeast(b, MIN_AGE)) {
      setTooYoung(true);
      AsyncStorage.setItem(UNDER_AGE_KEY, '1').catch(() => {});
    }
  };

  const handleRegister = async () => {
    if (registeringRef.current || tooYoung) return;
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword || !birthday) {
      warmAlert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      warmAlert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      warmAlert("Passwords don't match", 'Type the same password in both boxes.');
      return;
    }
    if (!agreed) {
      warmAlert('One more thing', 'Please agree to the Terms of Service and Privacy Policy to create your account.');
      return;
    }

    registeringRef.current = true;
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // When they agreed, and to which version. The birthday itself is
        // never sent — only that they passed the 13+ check.
        data: { full_name: fullName.trim(), terms_accepted_at: new Date().toISOString(), terms_version: LEGAL_UPDATED, age_confirmed: true },
        // The confirmation email's link reopens the app (LoginScreen shows
        // "Email confirmed") instead of the project's default Site URL.
        // Must also be listed under Supabase → Auth → URL Configuration →
        // Redirect URLs, or Supabase falls back to the Site URL.
        emailRedirectTo: EMAIL_CONFIRMED_URL,
      },
    });
    registeringRef.current = false;
    setLoading(false);

    if (error) {
      warmAlert('Sign up failed', error.message);
      return;
    }

    warmAlert(
      'Check your email',
      'We sent you a confirmation link. Please verify your email before signing in.',
      [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <FadeInView style={styles.header}>
          <AppLogo size={76} tone="light" style={styles.logoBadge} />
          <Text style={styles.logo}>NewStep</Text>
          <Text style={styles.tagline}>
            Connect with your school. Discover people, what's happening, and ways to help.
          </Text>
          {/* A peek at the next few minutes, drawn as footprints — you're on
              the first one. Footprints, not the help tracker's dots, which
              stay reserved for help requests. */}
          <OnboardingSteps current={0} tone="light" style={styles.journey} />
        </FadeInView>

        {tooYoung ? (
          <FadeInView style={styles.youngCard} delay={100}>
            <Text style={styles.youngTitle}>Come back a little later 💛</Text>
            <Text style={styles.youngText}>
              NewStep is for students {MIN_AGE} and older. Until then, your school counselor and teachers are great people to ask for help settling in.
            </Text>
          </FadeInView>
        ) : (
        <FadeInView style={styles.form} delay={100}>
          <Text style={styles.label}>Full Name</Text>
          <IconInput tone="light"
            icon="person-outline"
            placeholder="Alex Johnson"
            value={fullName}
            onChangeText={setFullName}
            autoComplete="name"
            maxLength={50}
          />

          <Text style={styles.label}>Birthday</Text>
          <BirthdayField value={birthday} onChange={pickBirthday} />
          <Text style={styles.hint}>Only used to check you're old enough — we don't save it.</Text>

          <Text style={styles.label}>Email</Text>
          <IconInput tone="light"
            icon="mail-outline"
            placeholder="you@school.edu"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={styles.label}>Password</Text>
          <IconInput tone="light"
            icon="lock-closed-outline"
            placeholder="At least 6 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />

          <Text style={styles.label}>Confirm Password</Text>
          <IconInput tone="light"
            icon="lock-closed-outline"
            placeholder="Type it again"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="new-password"
          />
          {confirmPassword.length > 0 && (
            <Text style={[styles.matchHint, password === confirmPassword ? styles.matchOk : styles.matchBad]}>
              {password === confirmPassword ? '✓ Passwords match' : "Passwords don't match yet"}
            </Text>
          )}

          <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed((a) => !a)} activeOpacity={0.8} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
            <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
              {agreed ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : null}
            </View>
            <Text style={styles.agreeText}>
              I agree to the{' '}
              <Text style={styles.agreeLink} onPress={() => navigation.navigate('Legal', { doc: 'terms' })}>
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text style={styles.agreeLink} onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}>
                Privacy Policy
              </Text>
              , and I'll follow the{' '}
              <Text style={styles.agreeLink} onPress={() => navigation.navigate('Legal', { doc: 'guidelines' })}>
                Community Guidelines
              </Text>
              .
            </Text>
          </TouchableOpacity>

          <PrimaryButton title="Create Account" onPress={handleRegister} loading={loading} disabled={!agreed} style={styles.button} />
        </FadeInView>
        )}

        <FadeInView style={styles.footer} delay={200}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.footerLink}>Sign in</Text>
          </TouchableOpacity>
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: light.background,
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  // The app icon itself, tilted a touch like a sticker.
  logoBadge: {
    marginBottom: spacing.md,
    transform: [{ rotate: '-6deg' }],
  },
  logo: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.xxxl,
    color: light.text,
  },
  tagline: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: light.textMid,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  journey: {
    marginTop: spacing.lg,
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: light.text,
    marginTop: spacing.sm,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: light.textLight,
    marginTop: -2,
  },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    marginTop: spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: light.border,
    backgroundColor: light.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  agreeText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: light.textMid,
  },
  agreeLink: {
    fontFamily: fontFamily.semibold,
    color: light.link,
  },
  youngCard: {
    backgroundColor: light.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: light.hairline,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  youngTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: light.text,
  },
  youngText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: light.textMid,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    fontFamily: fontFamily.regular,
    color: light.textMid,
    fontSize: fontSize.sm,
  },
  footerLink: {
    fontFamily: fontFamily.bold,
    color: light.link,
    fontSize: fontSize.sm,
  },
});
