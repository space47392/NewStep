import { supabase } from './supabase';
import { fetchPostsByIds } from './posts';
import { Post } from '../types';

export async function savePost(params: { postId: string; userId: string }): Promise<void> {
  const { error } = await supabase.from('post_saves').insert({ post_id: params.postId, user_id: params.userId });
  // 23505 = unique_violation — already saved (e.g. a double-tap race), treat as a no-op success.
  if (error && error.code !== '23505') throw error;
}

export async function unsavePost(params: { postId: string; userId: string }): Promise<void> {
  const { error } = await supabase
    .from('post_saves')
    .delete()
    .eq('post_id', params.postId)
    .eq('user_id', params.userId);
  if (error) throw error;
}

// One batched query per screen rather than a per-post check — same pattern as
// likes.ts's fetchLikedPostIds.
export async function fetchSavedPostIds(userId: string, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('post_saves')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.post_id as string));
}

// Powers SavedPostsScreen: page through post_saves (newest-saved first) to get
// the relevant ids, then hydrate full Post objects the same way every other
// post list does. fetchPostsByIds also naturally drops any saved post that
// was since deleted, with no error.
//
// Cursor-based pagination (Step 49, P1 #5) — `beforeCreatedAt` filters on
// post_saves.created_at (when the SAVE happened), not posts.created_at (when
// the POST was made) — this list is ordered by "most recently saved," so the
// cursor has to be the same column the ordering and the WHERE clause both
// use, or it wouldn't actually exclude what's already been seen. The old
// numeric offset drifted the same way Feed's did (Step 48): a new save
// landing on top while paging shifts every later row down by one, duplicating
// or skipping posts on "Load more."
//
// rawCount is the number of post_saves rows this page actually consumed
// (before hydration/deletion drops any), not posts.length — the caller needs
// it for hasMore. Using posts.length instead would under-count whenever a
// saved post has since been deleted or its author blocked, showing "no more"
// too early (Step 37). nextCursor is that same page's last raw row's
// created_at — null once a page comes back with nothing left to page through.
export async function fetchSavedPosts(
  userId: string,
  limit = 20,
  beforeCreatedAt?: string
): Promise<{ posts: Post[]; rawCount: number; nextCursor: string | null }> {
  let query = supabase
    .from('post_saves')
    .select('post_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (beforeCreatedAt) {
    query = query.lt('created_at', beforeCreatedAt);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return { posts: [], rawCount: 0, nextCursor: null };

  const ids = rows.map((row) => row.post_id as string);
  const posts = await fetchPostsByIds(ids);
  return { posts, rawCount: rows.length, nextCursor: rows[rows.length - 1].created_at as string };
}
