import { supabase } from './supabase';
import { DEFAULT_PREFS, type NotificationPrefs } from './notificationPrefs';

export async function fetchNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabase.from('notification_prefs').select('muted, paused_until').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as NotificationPrefs | null) ?? DEFAULT_PREFS;
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  const { error } = await supabase.rpc('set_notification_prefs', { p_muted: prefs.muted, p_paused_until: prefs.paused_until });
  if (error) throw error;
}
