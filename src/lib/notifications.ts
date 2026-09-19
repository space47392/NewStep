import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { colors } from '../constants/theme';
import { AppNotification, ChatProfile, NotificationType } from '../types';

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

// Shape of a push notification's data payload — see create_notification() in
// notifications_push_payload_fix.sql. Same fields resolveNotificationTarget()
// below reads off an in-app AppNotification row, so a push tap and an in-app
// tap on the same notification always resolve to the same destination.
export type PushNotificationData = {
  type?: string;
  post_id?: string | null;
  conversation_id?: string | null;
  achievement_id?: string | null;
  actor_id?: string | null;
};

// Call once near app startup. Hands the raw data payload to the caller —
// App.tsx resolves it to an actual destination via resolveNotificationTarget().
export function addNotificationResponseListener(onTap: (data: PushNotificationData) => void) {
  if (!Notifications) {
    return () => {};
  }

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = (response.notification.request.content.data ?? {}) as PushNotificationData;
    onTap(data);
  });

  return () => subscription.remove();
}

// Handles the "cold start" case addNotificationResponseListener() can't:
// addNotificationResponseReceivedListener() only fires for a response
// received while it's already registered, so the exact tap that launches the
// app from fully closed (not just backgrounded) never reaches it — the app
// would otherwise just open to the default screen instead of the
// notification's actual target. Call once near app startup, alongside
// addNotificationResponseListener(). Returns null both when there's genuinely
// no such response and when push isn't supported (Expo Go).
export async function getInitialNotificationResponse(): Promise<PushNotificationData | null> {
  if (!Notifications) return null;
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return null;
  return (response.notification.request.content.data ?? {}) as PushNotificationData;
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

// Newest first, cursor-paginated (Step 58) — never the full history in one
// call. Was offset-based (.range(offset, offset+limit-1)); converted for the
// same reason Feed/FollowList/SavedPosts already were (Step 48/49): a
// numeric offset drifts whenever a row is inserted above the page boundary
// while paging, and notifications are exactly that kind of frequently-
// inserted, live table (a like/comment/follow can land at any moment). Omit
// beforeCreatedAt for the first/most-recent page; pass the oldest
// currently-loaded notification's created_at to page further back.
// notifications_user_id_idx (user_id, created_at desc) already indexes
// exactly this access pattern — no schema change needed.
export async function fetchNotifications(userId: string, limit = 20, beforeCreatedAt?: string): Promise<AppNotification[]> {
  let query = supabase
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (beforeCreatedAt) {
    query = query.lt('created_at', beforeCreatedAt);
  }

  const { data, error } = await query;
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

// Same as above but for every member of a grouped notification (see
// groupNotifications()) in one round trip — one bulk update instead of N
// individual ones. Same RLS/guard-trigger protection applies per row.
export async function markNotificationsRead(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', notificationIds)
    .is('read_at', null);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Destination routing — ONE table shared by NotificationsScreen (in-app tap,
// which already has the full row) and App.tsx (push tap, which only has this
// same set of ids from the enriched push payload). Neither should hand-roll
// its own copy of this logic.
// ---------------------------------------------------------------------------

// Post-related types all resolve to the same destination — fetching the full
// Post is unavoidable since PostDetailScreen's route needs the whole object,
// not just an id, matching how every other screen already navigates there.
const POST_TYPES = new Set(['like', 'comment', 'volunteer', 'help_completed', 'thanks_received']);

export type NotificationTarget =
  | { screen: 'PostDetail'; postId: string }
  // actorId is nullable (Step 56E) — a message notification's actor_id is
  // `on delete set null` (see notifications_schema.sql), so a still-usable
  // conversation_id can outlive the actor's own account. A null actorId
  // means "open the conversation anyway; it's preserved, the other
  // participant has since deleted their account" (Step 56C's ChatScreen/
  // ConversationScreen already render that as "Deleted User" for a null
  // otherUser) — never means "don't navigate."
  | { screen: 'Conversation'; conversationId: string; actorId: string | null }
  | { screen: 'UserProfile'; userId: string }
  | { screen: 'ProfileTab' };

export function resolveNotificationTarget(fields: {
  type: string;
  post_id?: string | null;
  conversation_id?: string | null;
  actor_id?: string | null;
}): NotificationTarget | null {
  const { type, post_id, conversation_id, actor_id } = fields;

  if (POST_TYPES.has(type)) {
    return post_id ? { screen: 'PostDetail', postId: post_id } : null;
  }
  if (type === 'message') {
    // Only conversation_id is required now (Step 56E) — actor_id being null
    // no longer means "there's nowhere to go." conversation_id itself is
    // `on delete cascade` (notifications_schema.sql) — if the conversation
    // row is truly gone, this notification is deleted right along with it,
    // so a message notification that still exists always has a real,
    // still-existing conversation_id to navigate to.
    return conversation_id ? { screen: 'Conversation', conversationId: conversation_id, actorId: actor_id ?? null } : null;
  }
  if (type === 'follow' || type === 'story_wave') {
    return actor_id ? { screen: 'UserProfile', userId: actor_id } : null;
  }
  if (type === 'points_earned' || type === 'achievement_earned') {
    return { screen: 'ProfileTab' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lightweight client-side grouping — folds consecutive like/comment/follow
// notifications into one display row ("Alex and 3 others liked your post").
// Purely a display transform: every underlying notification row is untouched
// and still individually present in memberIds for bulk mark-as-read. Other
// types (volunteer, help_completed, thanks_received, message, achievements)
// are never merged — each represents a distinct actionable event the user
// should be able to identify on its own.
// ---------------------------------------------------------------------------

const GROUPABLE_TYPES = new Set<NotificationType>(['like', 'comment', 'follow']);

export type NotificationGroup = {
  id: string;
  type: NotificationType;
  post_id: string | null;
  conversation_id: string | null;
  created_at: string;
  read_at: string | null;
  // The representative actor shown/navigated-to for this group. Not
  // necessarily the newest member's actor — see the fallback logic below
  // (Step 58): if the newest member's actor has since deleted their
  // account (actor_id set null), this falls back to the next most recent
  // member's actor that's still live, from within this SAME group only.
  // Stays null only if every member's actor is gone.
  actor: ChatProfile | null;
  achievement: AppNotification['achievement'];
  memberIds: string[];
  // How many OTHER distinct actors are folded into this group, beyond `actor`.
  extraActorCount: number;
};

export function groupNotifications(notifications: AppNotification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const actorIdSets: Set<string>[] = [];

  for (const n of notifications) {
    const lastIndex = groups.length - 1;
    const last = lastIndex >= 0 ? groups[lastIndex] : undefined;
    const canMerge = !!last && GROUPABLE_TYPES.has(n.type) && last.type === n.type && last.post_id === n.post_id;

    if (canMerge && last) {
      last.memberIds.push(n.id);
      if (!n.read_at) last.read_at = null;
      if (n.actor) {
        actorIdSets[lastIndex].add(n.actor.id);
        last.extraActorCount = actorIdSets[lastIndex].size - 1;
        // Representative-actor fallback (Step 58): notifications arrive
        // newest-first, so the first live actor encountered while walking
        // forward through this group's own members is the most recent live
        // actor in that same group — never one borrowed from another group,
        // never fabricated. Only promotes once (while last.actor is still
        // null); once a live actor is picked it stays, so it doesn't keep
        // shifting as more members are folded in.
        if (!last.actor) {
          last.actor = n.actor;
        }
      }
    } else {
      groups.push({
        id: n.id,
        type: n.type,
        post_id: n.post_id,
        conversation_id: n.conversation_id,
        created_at: n.created_at,
        read_at: n.read_at,
        actor: n.actor,
        achievement: n.achievement,
        memberIds: [n.id],
        extraActorCount: 0,
      });
      actorIdSets.push(new Set(n.actor ? [n.actor.id] : []));
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Category-based visual priority (goal: distinguish help/social/achievement/
// message activity without redesigning the row). Reuses existing theme
// tokens only — no new colors.
// ---------------------------------------------------------------------------

export type NotificationCategory = 'help' | 'social' | 'achievement' | 'message';

const CATEGORY_BY_TYPE: Record<NotificationType, NotificationCategory> = {
  like: 'social',
  comment: 'social',
  follow: 'social',
  story_wave: 'social',
  volunteer: 'help',
  help_completed: 'help',
  thanks_received: 'help',
  points_earned: 'achievement',
  achievement_earned: 'achievement',
  message: 'message',
};

export function getNotificationCategoryColor(type: NotificationType): string {
  switch (CATEGORY_BY_TYPE[type] ?? 'social') {
    case 'help':
      return colors.secondary;
    case 'achievement':
      return colors.warning;
    case 'message':
      return colors.accent;
    default:
      return colors.primary;
  }
}

// Deliberately reconstructs a generic message rather than reading stored
// content — e.g. "message" never shows the actual text, since that was never
// persisted onto the notification row in the first place (see
// notify_new_message() in notifications_schema.sql).
//
// Takes just the fields it actually reads (not the full AppNotification) so
// a NotificationGroup — which carries the same type/actor/achievement shape —
// can be passed in directly by formatGroupedNotificationMessage() below,
// without a cast.
export function formatNotificationMessage(
  notification: Pick<AppNotification, 'type' | 'actor' | 'achievement'>
): string {
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

// Wording for a (possibly merged) group — falls back to the exact singular
// wording above whenever nothing was actually merged, so a non-grouped
// notification reads identically to before.
export function formatGroupedNotificationMessage(group: NotificationGroup): string {
  if (group.extraActorCount === 0) return formatNotificationMessage(group);

  const actorName = group.actor?.full_name ?? 'Someone';
  const suffix = group.extraActorCount === 1 ? '1 other' : `${group.extraActorCount} others`;
  switch (group.type) {
    case 'like':
      return `${actorName} and ${suffix} liked your post`;
    case 'comment':
      return `${actorName} and ${suffix} commented on your post`;
    case 'follow':
      return `${actorName} and ${suffix} started following you`;
    default:
      return formatNotificationMessage(group);
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
