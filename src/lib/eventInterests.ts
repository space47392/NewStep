import { supabase } from './supabase';

// Mirrors postSaves.ts exactly. "Interested" (I may participate) is
// deliberately separate from Save (I want to find this later) — never
// merged, never reusing post_saves' table or RLS.
export async function markInterested(params: { postId: string; userId: string }): Promise<void> {
  const { error } = await supabase
    .from('event_interests')
    .insert({ post_id: params.postId, user_id: params.userId });
  // 23505 = unique_violation — already marked interested (e.g. a double-tap race), treat as a no-op success.
  if (error && error.code !== '23505') throw error;
}

export async function unmarkInterested(params: { postId: string; userId: string }): Promise<void> {
  const { error } = await supabase
    .from('event_interests')
    .delete()
    .eq('post_id', params.postId)
    .eq('user_id', params.userId);
  if (error) throw error;
}

// One batched query per screen rather than a per-post check — same pattern
// as postSaves.ts's fetchSavedPostIds/likes.ts's fetchLikedPostIds. RLS on
// event_interests restricts SELECT to the caller's own rows, so this can
// only ever return the CURRENT user's interested-post ids, never anyone
// else's — "no giant list of users" is enforced at the database layer here,
// not just by this function's shape.
export async function fetchInterestedPostIds(userId: string, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('event_interests')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.post_id as string));
}
