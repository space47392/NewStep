import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// expo-notifications runs native event-emitter setup as soon as it's imported —
// NotificationsEmitter.js and TokenEmitter.js both do this unconditionally at
// module-load time, and that throws in Expo Go (remote push support was removed
// there in SDK 53+). A runtime `if` around individual function *calls* isn't
// enough to prevent this, because `import` statements are hoisted and always
// evaluate before any of our own code runs. A conditional `require()` is the only
// way to skip loading the module's code entirely when running in Expo Go.
const isExpoGo = isRunningInExpoGo();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Notifications: typeof import('expo-notifications') | null = isExpoGo
  ? null
  : require('expo-notifications');

// Controls how a notification is shown while the app is open in the foreground.
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

// Call once after login. Requests permission, gets this device's Expo push token,
// and saves it on the user's profile so triggers in Supabase know where to send to.
export async function registerForPushNotifications(userId: string): Promise<void> {
  if (!Notifications) {
    console.log('Skipping push notification registration — not supported in Expo Go.');
    return;
  }

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
  if (!Notifications) {
    return () => {};
  }

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { type?: string } | undefined;
    onTap(data?.type);
  });

  return () => subscription.remove();
}
