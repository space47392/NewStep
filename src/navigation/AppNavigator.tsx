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

  // Both local/session-only, never persisted — see the school-onboarding
  // branch below for why. Reset on every actual login/logout/account switch
  // (not on every render) so a second signup in the same app session doesn't
  // inherit the previous account's "already offered" state.
  const [justSignedUp, setJustSignedUp] = useState(false);
  const [schoolOnboardingDone, setSchoolOnboardingDone] = useState(false);
  useEffect(() => {
    setJustSignedUp(false);
    setSchoolOnboardingDone(false);
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
        ) : (
          // Logged in with a username → show main app (bottom tabs + screens
          // like CreatePost pushed on top)
          <RootStack.Screen name="Main" component={MainNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
