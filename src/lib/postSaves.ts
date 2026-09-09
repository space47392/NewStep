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
// rawCount is the number of post_saves rows this page actually consumed
// (before hydration/deletion drops any), not posts.length — the caller needs
// it to compute the next page's offset. Using posts.length instead would
// under-count whenever a saved post has since been deleted, re-requesting
// rows already consumed and duplicating posts on "Load more" (Step 37).
export async function fetchSavedPosts(
  userId: string,
  limit = 20,
  offset = 0
): Promise<{ posts: Post[]; rawCount: number }> {
  const { data, error } = await supabase
    .from('post_saves')
    .select('post_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const ids = (data ?? []).map((row) => row.post_id as string);
  if (ids.length === 0) return { posts: [], rawCount: 0 };
  const posts = await fetchPostsByIds(ids);
  return { posts, rawCount: ids.length };
}
