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
import { supabase } from './src/lib/supabase';
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
  // push payload, so PostDetail/Conversation/UserProfile all need a fresh
  // fetch first — same trade-off NotificationsScreen already makes for its
  // own PostDetail taps, now applied to every target type.
  //
  // This listener is registered once, above AuthProvider, for the app's
  // entire lifetime — so a notification delivered to Account A can still be
  // sitting in the OS tray after A logs out and Account B logs in on the
  // same device. Every fetch below runs through the shared `supabase`
  // client, which is always authenticated as whoever is CURRENTLY signed in
  // — never whatever account the original push payload was addressed to —
  // so a stale target the current session isn't allowed to see (e.g. a
  // conversation it isn't a participant in, per chat_schema.sql's RLS) fails
  // the fetch and falls through to the catch below instead of opening
  // anything. The active-session check up front covers the case where
  // nobody's logged in at all (Step 40).
  useEffect(() => {
    return addNotificationResponseListener(async (data) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
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
          // Participant-scoped by RLS — throws for a conversation the
          // current session isn't actually part of, which is exactly what
          // stops a stale notification from a previous account routing the
          // current one into someone else's conversation.
          const actor = await fetchProfileById(target.actorId);
          navigateToMainStack('Conversation', {
            conversationId: target.conversationId,
            otherUser: { id: actor.id, full_name: actor.full_name, avatar_url: actor.avatar_url },
          });
        } else if (target.screen === 'UserProfile') {
          // Resolved first, same as the other two — an id that no longer
          // resolves to anything never becomes a navigation.
          await fetchProfileById(target.userId);
          navigateToMainStack('UserProfile', { userId: target.userId });
        } else {
          navigateToMainStack('Tabs', { screen: 'Profile' });
        }
      } catch {
        // e.g. the post/user was deleted, the conversation isn't accessible
        // to whoever is actually signed in right now, or this notification
        // simply belonged to a different account than the one active on
        // this device now — never distinguish between these reasons (doing
        // so would itself leak which case it was), just fail closed: don't
        // navigate into a broken screen. No toast mechanism is reachable
        // from this module-level listener (it's registered above
        // AuthProvider/ToastProvider), so landing on a normal tab is the
        // safe fallback instead.
        navigateToMainStack('Tabs', undefined);
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
