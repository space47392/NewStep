import { supabase } from './supabase';
import { PointsHistoryEntry } from '../types';

// "Help requests completed" and "students helped" are derived from the existing
// posts table (helper_id + status), not duplicated into any new column — posts
// are already fully public-read, so this needs no new RLS. "Students helped" is
// a distinct-author count rather than a raw row count, since helping the same
// student twice should read as one relationship, not two — a more honest
// reputation signal than just re-showing the points total.
export async function fetchHelpStats(userId: string): Promise<{ completedCount: number; studentsHelped: number }> {
  const { data, error } = await supabase
    .from('posts')
    .select('author_id')
    .eq('helper_id', userId)
    .eq('status', 'completed');

  if (error) throw error;
  const rows = data ?? [];
  return {
    completedCount: rows.length,
    studentsHelped: new Set(rows.map((r) => r.author_id)).size,
  };
}

// A user's own point-earning history. RLS restricts this to rows where
// user_id = auth.uid() (see points_history_schema.sql), and only
// handle_post_completed() ever inserts a row — so what's shown here can't be
// faked, edited, or backdated by the client.
export async function fetchPointsHistory(userId: string, limit = 20): Promise<PointsHistoryEntry[]> {
  const { data, error } = await supabase
    .from('points_history')
    .select('id, amount, reason, post_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as PointsHistoryEntry[];
}

// Human-readable label for a points_history reason. Falls back to a de-slugged
// version of the raw reason so a future reason (added server-side) still
// renders something reasonable without a required UI change.
export function formatPointReason(reason: string): string {
  switch (reason) {
    case 'help_completed':
      return 'Help completed';
    default:
      return reason.replace(/_/g, ' ');
  }
}
