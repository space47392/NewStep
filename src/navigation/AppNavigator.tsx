import { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { RootStackParamList, AuthStackParamList } from '../types';
import LoadingScreen from '../components/LoadingScreen';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ChooseUsernameScreen from '../screens/auth/ChooseUsernameScreen';
import ChooseInterestsScreen from '../screens/auth/ChooseInterestsScreen';
import ChooseNewStudentScreen from '../screens/auth/ChooseNewStudentScreen';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import ChooseSchoolScreen from '../screens/main/ChooseSchoolScreen';
import MainNavigator from './MainNavigator';
import { navigationRef } from './navigationRef';
import { useScreenContentStyle, NO_TOP_INSET } from './screenInsets';

const RootStack = createNativeStackNavigator<RootStackParamList>();

// Reads key=value pairs from a link's #fragment (where Supabase puts tokens)
// or ?query (where it puts errors). Parsed by hand — RN's URLSearchParams
// isn't fully implemented on every version.
function linkParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = [url.split('#')[1] ?? '', (url.split('?')[1] ?? '').split('#')[0]];
  for (const part of parts) {
    for (const pair of part.split('&')) {
      const eq = pair.indexOf('=');
      if (eq > 0) out[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
    }
  }
  return out;
}
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator() {
  const contentStyle = useScreenContentStyle();
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle }}>
      {/* Vertically centered, and its intro paints behind the status bar. */}
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ contentStyle: NO_TOP_INSET }} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

export default function AppNavigator() {
  const { session, loading, username, usernameLoading } = useAuth();
  const contentStyle = useScreenContentStyle();

  // All local/session-only, never persisted — see the onboarding branches
  // below for why. Reset on every actual login/logout/account switch (not on
  // every render) so a second signup in the same app session doesn't inherit
  // the previous account's "already offered" state.
  const [justSignedUp, setJustSignedUp] = useState(false);
  const [schoolOnboardingDone, setSchoolOnboardingDone] = useState(false);
  const [interestsOnboardingDone, setInterestsOnboardingDone] = useState(false);
  const [newStudentOnboardingDone, setNewStudentOnboardingDone] = useState(false);
  const [welcomeOnboardingDone, setWelcomeOnboardingDone] = useState(false);
  // True while a password-reset link is being used — see the effect below.
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const handledLinksRef = useRef(new Set<string>());

  // "Forgot password?" email link (newstep://reset-password#access_token=…).
  // Its one-time recovery session has to be active before updateUser() may
  // set a new password, so it's applied here and ResetPasswordScreen shows
  // until the student saves or cancels. Lives here (not on LoginScreen)
  // because applying the session signs in, which would unmount LoginScreen.
  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url || !url.startsWith('newstep://')) return;
      const params = linkParams(url);
      // Also accepts a recovery link that landed on another newstep:// path
      // (Supabase falls back to the Site URL when reset-password isn't in
      // its Redirect URLs list) — type=recovery is what marks it.
      const isResetLink = url.startsWith('newstep://reset-password') || params.type === 'recovery';
      if (!isResetLink) return;
      if (handledLinksRef.current.has(url)) return;
      handledLinksRef.current.add(url);
      if (params.error_description) {
        Alert.alert("This reset link didn't work", params.error_description + ' Request a new one from "Forgot password?".');
        return;
      }
      if (!params.access_token || !params.refresh_token) return;
      setRecoveringPassword(true);
      const { error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      if (error) {
        setRecoveringPassword(false);
        Alert.alert("This reset link didn't work", error.message);
      }
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      handle(url);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    setJustSignedUp(false);
    setSchoolOnboardingDone(false);
    setInterestsOnboardingDone(false);
    setNewStudentOnboardingDone(false);
    setWelcomeOnboardingDone(false);
  }, [session?.user?.id]);

  // Show a spinner while Supabase checks for a stored session, and — once
  // logged in — while we check whether this account has a username yet.
  if (loading || (session && usernameLoading)) {
    return <LoadingScreen />;
  }

  // Only true for the exact session that just finished ChooseUsername —
  // never for an existing user who logs in already having a username (they
  // never render ChooseUsername at all, so this can't flip true for them),
  // and never re-shown after an app restart (in-memory only). That's
  // deliberate: skipping this step must stay truly optional forever, not
  // just until the next launch — the existing Profile entry point is the
  // permanent way back in for anyone who skips or closes the app mid-flow.
  const showSchoolOnboarding = !!session && !!username && justSignedUp && !schoolOnboardingDone;
  // Step 25: two more one-time steps chained after School, same gating shape
  // — each only reachable once the previous one is done, each permanently
  // skippable (Interests) or a single "Enter NewStep" tap (Welcome), never
  // re-shown after this session ends.
  const showInterestsOnboarding =
    !!session && !!username && justSignedUp && schoolOnboardingDone && !interestsOnboardingDone;
  // Step 29 audit fix: one more one-time step chained after Interests, same
  // gating shape — reuses the existing profiles.is_new_student column/RLS,
  // just asked once here instead of only ever being reachable via Edit Profile.
  const showNewStudentOnboarding =
    !!session &&
    !!username &&
    justSignedUp &&
    schoolOnboardingDone &&
    interestsOnboardingDone &&
    !newStudentOnboardingDone;
  const showWelcomeOnboarding =
    !!session &&
    !!username &&
    justSignedUp &&
    schoolOnboardingDone &&
    interestsOnboardingDone &&
    newStudentOnboardingDone &&
    !welcomeOnboardingDone;

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator screenOptions={{ headerShown: false, contentStyle }}>
        {recoveringPassword && session ? (
          <RootStack.Screen name="ResetPassword">
            {() => <ResetPasswordScreen onDone={() => setRecoveringPassword(false)} />}
          </RootStack.Screen>
        ) : !session ? (
          // Logged out → show auth screens
          <RootStack.Screen name="Auth" component={AuthNavigator as any} options={{ contentStyle: NO_TOP_INSET }} />
        ) : !username ? (
          // Logged in but no username yet — covers both pre-existing accounts
          // from before this feature existed, and brand new signups (a fresh
          // profile row also starts with username = null).
          <RootStack.Screen name="ChooseUsername">
            {() => <ChooseUsernameScreen onComplete={() => setJustSignedUp(true)} />}
          </RootStack.Screen>
        ) : showSchoolOnboarding ? (
          // One-time nudge for a brand-new signup only — see showSchoolOnboarding above.
          <RootStack.Screen name="ChooseSchool">
            {() => (
              <ChooseSchoolScreen
                title="Where's your school?"
                subtitle="Choose your school to see your school community, stories, and people. Selecting a school does not verify enrollment."
                showSkip
                onDone={() => setSchoolOnboardingDone(true)}
              />
            )}
          </RootStack.Screen>
        ) : showInterestsOnboarding ? (
          <RootStack.Screen name="ChooseInterests">
            {() => <ChooseInterestsScreen onDone={() => setInterestsOnboardingDone(true)} />}
          </RootStack.Screen>
        ) : showNewStudentOnboarding ? (
          <RootStack.Screen name="ChooseNewStudent">
            {() => <ChooseNewStudentScreen onDone={() => setNewStudentOnboardingDone(true)} />}
          </RootStack.Screen>
        ) : showWelcomeOnboarding ? (
          <RootStack.Screen name="Welcome">
            {() => <WelcomeScreen onDone={() => setWelcomeOnboardingDone(true)} />}
          </RootStack.Screen>
        ) : (
          // Logged in with a username → show main app (bottom tabs + screens
          // like CreatePost pushed on top)
          <RootStack.Screen name="Main" component={MainNavigator} options={{ contentStyle: NO_TOP_INSET }} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
