import { supabase } from './supabase';
import type { ModerationAction, ModerationKind, QueueItem } from './moderation';

export async function fetchMyRole(): Promise<string | null> {
  const { data, error } = await supabase.rpc('my_role');
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function fetchModerationQueue(): Promise<QueueItem[]> {
  const { data, error } = await supabase.rpc('moderation_queue');
  if (error) throw error;
  return (data ?? []) as QueueItem[];
}

export async function moderate(kind: ModerationKind, targetId: string, action: ModerationAction, note?: string): Promise<void> {
  const { error } = await supabase.rpc('moderate', { p_kind: kind, p_target: targetId, p_action: action, p_note: note ?? null });
  if (error) throw error;
}
