import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../contexts/AuthContext';
import { RootStackParamList, AuthStackParamList } from '../types';
import LoadingScreen from '../components/LoadingScreen';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ChooseUsernameScreen from '../screens/auth/ChooseUsernameScreen';
import ChooseInterestsScreen from '../screens/auth/ChooseInterestsScreen';
import ChooseNewStudentScreen from '../screens/auth/ChooseNewStudentScreen';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import ChooseSchoolScreen from '../screens/main/ChooseSchoolScreen';
import MainNavigator from './MainNavigator';
import { navigationRef } from './navigationRef';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

export default function AppNavigator() {
  const { session, loading, username, usernameLoading } = useAuth();

  // All local/session-only, never persisted — see the onboarding branches
  // below for why. Reset on every actual login/logout/account switch (not on
  // every render) so a second signup in the same app session doesn't inherit
  // the previous account's "already offered" state.
  const [justSignedUp, setJustSignedUp] = useState(false);
  const [schoolOnboardingDone, setSchoolOnboardingDone] = useState(false);
  const [interestsOnboardingDone, setInterestsOnboardingDone] = useState(false);
  const [newStudentOnboardingDone, setNewStudentOnboardingDone] = useState(false);
  const [welcomeOnboardingDone, setWelcomeOnboardingDone] = useState(false);
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
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          // Logged out → show auth screens
          <RootStack.Screen name="Auth" component={AuthNavigator as any} />
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
          <RootStack.Screen name="Main" component={MainNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
