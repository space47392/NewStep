import { supabase } from './supabase';
import { ChatProfile } from '../types';

export async function likePost(params: { postId: string; userId: string }): Promise<void> {
  const { error } = await supabase.from('likes').insert({ post_id: params.postId, user_id: params.userId });
  // 23505 = unique_violation — already liked (e.g. a double-tap race), treat as a no-op success.
  if (error && error.code !== '23505') throw error;
}

export async function unlikePost(params: { postId: string; userId: string }): Promise<void> {
  const { error } = await supabase.from('likes').delete().eq('post_id', params.postId).eq('user_id', params.userId);
  if (error) throw error;
}

// One batched query per screen rather than a per-post check — same pattern used
// for unread message counts in the chat feature.
export async function fetchLikedPostIds(userId: string, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.post_id as string));
}

type LikerRow = { profiles: ChatProfile | null };

export async function fetchPostLikers(postId: string): Promise<ChatProfile[]> {
  const { data, error } = await supabase
    .from('likes')
    .select('profiles:user_id (id, full_name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as unknown as LikerRow[];
  return rows.map((row) => row.profiles).filter((p): p is ChatProfile => p !== null);
}

export function subscribeToLikes(
  postId: string,
  onChange: (event: { type: 'insert' | 'delete'; userId: string }) => void
) {
  const channel = supabase
    .channel(`likes:${postId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'likes', filter: `post_id=eq.${postId}` },
      (payload) => {
        onChange({ type: 'insert', userId: (payload.new as { user_id: string }).user_id });
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'likes', filter: `post_id=eq.${postId}` },
      (payload) => {
        onChange({ type: 'delete', userId: (payload.old as { user_id: string }).user_id });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
