import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { warmAlert } from '../../components/WarmAlert';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import IconInput from '../../components/IconInput';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import AppLogo from '../../components/AppLogo';
import FootstepsIntro from '../../components/FootstepsIntro';
import { StatusBar } from 'expo-status-bar';
import { light, spacing, fontSize, fontFamily, typography } from '../../constants/theme';
import { AuthStackParamList } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

// Links already answered with an alert. Module-level because a cold-start
// link is returned by getInitialURL() for the whole app session — without
// this, every remount of this screen (e.g. after logging out) and the 'url'
// event for the same open would each show the alert again.
const handledLinks = new Set<string>();

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
        warmAlert("Couldn't confirm your email", error);
      } else {
        warmAlert('Email confirmed ✅', 'You can sign in with your email and password now.');
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
      warmAlert('Missing fields', 'Please enter your email and password.');
      return;
    }

    loggingInRef.current = true;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    loggingInRef.current = false;
    setLoading(false);

    if (error) {
      warmAlert('Login failed', error.message);
    }
    // On success, AuthContext detects the new session and AppNavigator
    // automatically redirects to the main app — no manual navigation needed.
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Dark clock/battery on the bright page (the intro sets its own). */}
      {!showIntro && <StatusBar style="dark" />}
      <View style={styles.inner}>
        {/* One column, left-aligned; honey only on the mark and the button. */}
        <FadeInView style={styles.header}>
          <View style={styles.brandRow}>
            <AppLogo size={40} variant="mark" tone="light" />
            <Text style={styles.brand}>NewStep</Text>
          </View>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Your guide to a new school.</Text>
        </FadeInView>

        <FadeInView style={styles.form} delay={100}>
          <IconInput
            tone="light"
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <IconInput
            tone="light"
            placeholder="Password"
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
          <Text style={styles.footerText}>New to NewStep? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.footerLink}>Create an account</Text>
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
    backgroundColor: light.background,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  header: {
    marginBottom: spacing.xl,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  brand: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.lg,
    color: light.text,
  },
  title: {
    ...typography.largeTitle,
    color: light.text,
  },
  subtitle: {
    ...typography.body,
    color: light.textLight,
    marginTop: spacing.xs,
  },
  form: {
    gap: spacing.sm + 4,
  },
  forgotButton: {
    alignSelf: 'flex-end',
  },
  forgotText: {
    fontFamily: fontFamily.medium,
    color: light.textMid,
    fontSize: fontSize.sm,
  },
  button: {
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    fontFamily: fontFamily.regular,
    color: light.textLight,
    fontSize: fontSize.sm,
  },
  footerLink: {
    fontFamily: fontFamily.semibold,
    color: light.text,
    fontSize: fontSize.sm,
  },
});
