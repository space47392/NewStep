import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import IconInput from '../../components/IconInput';
import PrimaryButton from '../../components/PrimaryButton';
import OnboardingSteps from '../../components/OnboardingSteps';
import FadeInView from '../../components/FadeInView';
import AppLogo from '../../components/AppLogo';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { AuthStackParamList } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

export const EMAIL_CONFIRMED_URL = 'newstep://email-confirmed';

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

  const handleRegister = async () => {
    if (registeringRef.current) return;
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords don't match", 'Type the same password in both boxes.');
      return;
    }

    registeringRef.current = true;
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
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
      Alert.alert('Sign up failed', error.message);
      return;
    }

    Alert.alert(
      'Check your email',
      'We sent you a confirmation link. Please verify your email before signing in.',
      [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <FadeInView style={styles.header}>
          <AppLogo size={76} style={styles.logoBadge} />
          <Text style={styles.logo}>NewStep</Text>
          <Text style={styles.tagline}>
            Connect with your school. Discover people, what's happening, and ways to help.
          </Text>
          {/* A peek at the next few minutes, drawn as footprints — you're on
              the first one. Footprints, not the help tracker's dots, which
              stay reserved for help requests. */}
          <OnboardingSteps current={0} style={styles.journey} />
        </FadeInView>

        <FadeInView style={styles.form} delay={100}>
          <Text style={styles.label}>Full Name</Text>
          <IconInput
            icon="person-outline"
            placeholder="Alex Johnson"
            value={fullName}
            onChangeText={setFullName}
            autoComplete="name"
            maxLength={50}
          />

          <Text style={styles.label}>Email</Text>
          <IconInput
            icon="mail-outline"
            placeholder="you@school.edu"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={styles.label}>Password</Text>
          <IconInput
            icon="lock-closed-outline"
            placeholder="At least 6 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />

          <Text style={styles.label}>Confirm Password</Text>
          <IconInput
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

          <PrimaryButton title="Create Account" onPress={handleRegister} loading={loading} style={styles.button} />
        </FadeInView>

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
    backgroundColor: colors.background,
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
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.xxxl,
    color: colors.primary,
  },
  tagline: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textMid,
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
    color: colors.textDark,
    marginTop: spacing.sm,
  },
  matchHint: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    marginTop: -2,
  },
  matchOk: {
    color: colors.accentDark,
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
    color: colors.textMid,
    fontSize: fontSize.sm,
  },
  footerLink: {
    fontFamily: fontFamily.bold,
    color: colors.primary,
    fontSize: fontSize.sm,
  },
});
