import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Controls how a notification is shown while the app is open in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Call once after login. Requests permission, gets this device's Expo push token,
// and saves it on the user's profile so triggers in Supabase know where to send to.
export async function registerForPushNotifications(userId: string): Promise<void> {
  if (Platform.OS === 'android') {
    // Android 13+ won't show the permission prompt until a channel exists.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6C63FF',
    });
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn(
      'No EAS projectId found — run `eas init` first. Push notifications cannot register a token without it.'
    );
    return;
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
}

// Call once near app startup. Routes a tapped notification to the relevant tab
// (not the exact post/conversation — that would need an extra fetch before navigating).
export function addNotificationResponseListener(onTap: (type: string | undefined) => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { type?: string } | undefined;
    onTap(data?.type);
  });

  return () => subscription.remove();
}
