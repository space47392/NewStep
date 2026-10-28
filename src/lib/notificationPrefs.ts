// Notification settings (supabase/notification_prefs.sql). Pure and unit tested.
// The database calls are in notificationPrefsApi.ts.

export type NotificationCategoryKey = 'messages' | 'buddies' | 'help' | 'social' | 'sky' | 'achievements';

export type NotificationCategory = {
  key: NotificationCategoryKey;
  label: string;
  hint: string;
  // Notification types in this group. Must match notification_category() in the SQL.
  types: string[];
};

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  { key: 'messages', label: 'Messages', hint: 'When a classmate writes to you', types: ['message'] },
  { key: 'buddies', label: 'Buddies', hint: 'Buddy requests and answers', types: ['buddy_request', 'buddy_accepted'] },
  {
    key: 'help',
    label: 'Help requests',
    hint: 'Offers to help, thank-yous and points',
    types: ['volunteer', 'help_completed', 'helper_chosen', 'thanks_received', 'points_earned'],
  },
  { key: 'social', label: 'Likes, comments & follows', hint: 'Reactions to your posts and stories', types: ['like', 'comment', 'follow', 'story_wave'] },
  { key: 'sky', label: 'School Sky', hint: 'Twinkles, wish cheers and notes on your lanterns', types: ['sky_twinkle', 'wish_cheer', 'lantern_note', 'lantern_thanks'] },
  { key: 'achievements', label: 'Stickers', hint: 'When you unlock a new sticker', types: ['achievement_earned'] },
];

export function categoryOf(type: string): NotificationCategoryKey | null {
  return NOTIFICATION_CATEGORIES.find((c) => c.types.includes(type))?.key ?? null;
}

export type NotificationPrefs = { muted: NotificationCategoryKey[]; paused_until: string | null };

export const DEFAULT_PREFS: NotificationPrefs = { muted: [], paused_until: null };

export function isPaused(prefs: NotificationPrefs, now = new Date()): boolean {
  return !!prefs.paused_until && new Date(prefs.paused_until).getTime() > now.getTime();
}

export type PauseLength = 'hour' | 'tomorrow';

// "For an hour", or "until tomorrow morning" (7:00, local time).
export function pauseUntil(length: PauseLength, now = new Date()): Date {
  if (length === 'hour') return new Date(now.getTime() + 60 * 60 * 1000);
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  t.setHours(7, 0, 0, 0);
  return t;
}

// "Paused until 7:00 AM" / "Paused until Tue 7:00 AM".
export function pausedLabel(prefs: NotificationPrefs, now = new Date()): string | null {
  if (!isPaused(prefs, now)) return null;
  const until = new Date(prefs.paused_until!);
  const sameDay = until.toDateString() === now.toDateString();
  const time = until.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `Paused until ${time}` : `Paused until ${until.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}

export function toggleMuted(prefs: NotificationPrefs, key: NotificationCategoryKey, on: boolean): NotificationPrefs {
  const muted = on ? prefs.muted.filter((k) => k !== key) : [...new Set([...prefs.muted, key])];
  return { ...prefs, muted };
}
