import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { AppNotification, NotificationType } from '../types';

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

// ---------------------------------------------------------------------------
// In-app notification data — a separate concern from the push delivery above.
// A push is a fire-and-forget OS-level alert; these read/write the persistent
// notifications table (see notifications_schema.sql) that backs the in-app
// notification list, unread badge, etc. Every row is created only by trusted
// database triggers — nothing here ever inserts a notification directly.
// ---------------------------------------------------------------------------

const NOTIFICATION_SELECT = `
  id, type, post_id, conversation_id, read_at, created_at,
  actor:actor_id (id, full_name, avatar_url),
  achievement:achievement_id (id, key, name, icon)
`;

// Newest first, paginated — never the full history in one call.
export async function fetchNotifications(userId: string, limit = 20, offset = 0): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data ?? []) as unknown as AppNotification[];
}

// head: true — just the count, never the rows, for the badge.
export async function fetchUnreadNotificationCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw error;
  return count ?? 0;
}

// Goes through the plain "own row" RLS policy — safe because
// guard_notification_update() (see notifications_schema.sql) rejects any
// change except read_at, so this can't be abused to rewrite a notification's
// type/actor/achievement into something fabricated.
export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null);

  if (error) throw error;
}

// Deliberately reconstructs a generic message rather than reading stored
// content — e.g. "message" never shows the actual text, since that was never
// persisted onto the notification row in the first place (see
// notify_new_message() in notifications_schema.sql).
export function formatNotificationMessage(notification: AppNotification): string {
  const actorName = notification.actor?.full_name ?? 'Someone';
  switch (notification.type) {
    case 'like':
      return `${actorName} liked your post`;
    case 'comment':
      return `${actorName} commented on your post`;
    case 'volunteer':
      return `${actorName} volunteered to help you`;
    case 'help_completed':
      return 'Your help was marked as completed';
    case 'points_earned':
      return 'You earned 1 Community Point';
    case 'achievement_earned':
      return `You earned "${notification.achievement?.name ?? 'an achievement'}"`;
    case 'message':
      return `${actorName} sent you a message`;
    case 'follow':
      return `${actorName} started following you`;
    case 'story_wave':
      return `${actorName} said hi to your story`;
    case 'thanks_received':
      return `${actorName} thanked you for your help`;
    default:
      return 'New notification';
  }
}

export function getNotificationIcon(type: NotificationType): string {
  switch (type) {
    case 'like':
      return '❤️';
    case 'comment':
      return '💬';
    case 'volunteer':
      return '🤝';
    case 'help_completed':
      return '✅';
    case 'points_earned':
      return '⭐';
    case 'achievement_earned':
      return '🏆';
    case 'message':
      return '💬';
    case 'follow':
      return '👋';
    case 'story_wave':
      return '👋';
    case 'thanks_received':
      return '💙';
    default:
      return '🔔';
  }
}
