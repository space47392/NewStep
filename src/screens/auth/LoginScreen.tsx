import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import IconInput from '../../components/IconInput';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import FootstepsIntro from '../../components/FootstepsIntro';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { AuthStackParamList } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

// Links already answered with an alert. Module-level because a cold-start
// link is returned by getInitialURL() for the whole app session — without
// this, every remount of this screen (e.g. after logging out) and the 'url'
// event for the same open would each show the alert again.
const handledLinks = new Set<string>();

const TRAIL = [
  { opacity: 0.15, y: 6 },
  { opacity: 0.3, y: -2 },
  { opacity: 0.5, y: 6 },
];

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Plays every time this screen mounts (app launch, or after logging out).
  // Coming back from Register/Forgot Password doesn't remount it — those
  // screens sit on top in the stack — so the intro never replays mid-flow.
  const [showIntro, setShowIntro] = useState(true);

  // Opened from the sign-up confirmation email (see EMAIL_CONFIRMED_URL in
  // RegisterScreen). Deliberately does NOT sign in from tokens in the link —
  // any app could open a newstep:// link with someone else's tokens — it
  // only says the email is confirmed, and the student signs in as usual.
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url || !url.startsWith('newstep://email-confirmed')) return;
      // A password-reset link can land here too (Site URL fallback) —
      // AppNavigator handles those.
      if (url.includes('type=recovery')) return;
      if (handledLinks.has(url)) return;
      handledLinks.add(url);
      setShowIntro(false);
      const fragment = url.split('#')[1] ?? url.split('?')[1] ?? '';
      // Parsed by hand — RN's URLSearchParams isn't fully implemented on
      // every version.
      const errorPair = fragment.split('&').find((pair) => pair.startsWith('error_description='));
      const error = errorPair ? decodeURIComponent(errorPair.slice('error_description='.length).replace(/\+/g, ' ')) : null;
      if (error) {
        Alert.alert("Couldn't confirm your email", error);
      } else {
        Alert.alert('Email confirmed ✅', 'You can sign in with your email and password now.');
      }
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);
  // Synchronous re-entrancy guard — `loading` state only disables the button
  // on the next render, leaving a brief window for a rapid double-tap to fire
  // a second signInWithPassword() call. Not just a cosmetic concern: Supabase
  // rate-limits sign-in attempts, so an accidental duplicate attempt on wrong
  // credentials could count twice toward that limit for one real attempt.
  const loggingInRef = useRef(false);

  const handleLogin = async () => {
    if (loggingInRef.current) return;
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }

    loggingInRef.current = true;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    loggingInRef.current = false;
    setLoading(false);

    if (error) {
      Alert.alert('Login failed', error.message);
    }
    // On success, AuthContext detects the new session and AppNavigator
    // automatically redirects to the main app — no manual navigation needed.
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <FadeInView style={styles.header}>
          {/* Footprints walking up to the badge — the "new step" itself. */}
          <View style={styles.trail} importantForAccessibility="no-hide-descendants">
            {TRAIL.map((step, i) => (
              <Ionicons
                key={i}
                name="footsteps"
                size={14}
                color={colors.primary}
                style={{ opacity: step.opacity, transform: [{ translateY: step.y }, { rotate: '-90deg' }] }}
              />
            ))}
          </View>
          <View style={styles.logoBadge}>
            <Ionicons name="footsteps" size={32} color={colors.primary} />
          </View>
          <Text style={styles.logo}>NewStep</Text>
          <Text style={styles.tagline}>Your guide to a new school</Text>
        </FadeInView>

        <FadeInView style={styles.form} delay={100}>
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
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <PrimaryButton title="Sign In" onPress={handleLogin} loading={loading} style={styles.button} />
        </FadeInView>

        <FadeInView style={styles.footer} delay={200}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.footerLink}>Sign up</Text>
          </TouchableOpacity>
        </FadeInView>
      </View>
      {showIntro && (
        <FootstepsIntro
          onDone={() => setShowIntro(false)}
        />
      )}
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
    marginBottom: spacing.xxl,
  },
  trail: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
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
    marginTop: spacing.xs,
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
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
  },
  forgotText: {
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    fontSize: fontSize.sm,
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
