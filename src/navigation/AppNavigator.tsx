import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../contexts/AuthContext';
import { RootStackParamList, AuthStackParamList } from '../types';
import LoadingScreen from '../components/LoadingScreen';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ChooseUsernameScreen from '../screens/auth/ChooseUsernameScreen';
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

  // Show a spinner while Supabase checks for a stored session, and — once
  // logged in — while we check whether this account has a username yet.
  if (loading || (session && usernameLoading)) {
    return <LoadingScreen />;
  }

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
          <RootStack.Screen name="ChooseUsername" component={ChooseUsernameScreen} />
        ) : (
          // Logged in with a username → show main app (bottom tabs + screens
          // like CreatePost pushed on top)
          <RootStack.Screen name="Main" component={MainNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
