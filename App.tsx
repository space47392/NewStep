import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import { AuthProvider } from './src/contexts/AuthContext';
import { ToastProvider } from './src/contexts/ToastContext';
import AppNavigator from './src/navigation/AppNavigator';
import { navigateToMainStack } from './src/navigation/navigationRef';
import { addNotificationResponseListener, resolveNotificationTarget } from './src/lib/notifications';
import { fetchPostById } from './src/lib/posts';
import { fetchProfileById } from './src/lib/profile';
import { colors } from './src/constants/theme';

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // Routes a tapped push notification to its actual destination — the same
  // resolveNotificationTarget() table NotificationsScreen uses for an in-app
  // tap, so the two never drift into different behavior. Unlike an in-app
  // tap (which already has the row loaded), this only has the ids from the
  // push payload, so PostDetail/Conversation need one fetch first — same
  // trade-off NotificationsScreen already makes for its own PostDetail taps.
  useEffect(() => {
    return addNotificationResponseListener(async (data) => {
      if (!data.type) return;
      const target = resolveNotificationTarget({
        type: data.type,
        post_id: data.post_id,
        conversation_id: data.conversation_id,
        actor_id: data.actor_id,
      });
      if (!target) return;

      try {
        if (target.screen === 'PostDetail') {
          const post = await fetchPostById(target.postId);
          navigateToMainStack('PostDetail', { post });
        } else if (target.screen === 'Conversation') {
          const actor = await fetchProfileById(target.actorId);
          navigateToMainStack('Conversation', {
            conversationId: target.conversationId,
            otherUser: { id: actor.id, full_name: actor.full_name, avatar_url: actor.avatar_url },
          });
        } else if (target.screen === 'UserProfile') {
          navigateToMainStack('UserProfile', { userId: target.userId });
        } else {
          navigateToMainStack('Tabs', { screen: 'Profile' });
        }
      } catch {
        // e.g. the post/user was deleted since the push was sent — do nothing,
        // same as NotificationsScreen's own tap handler falling through silently.
      }
    });
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <AppNavigator />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
