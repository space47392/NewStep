import { supabase } from './supabase';
import { Comment } from '../types';

export async function fetchComments(postId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(
      `
      id,
      post_id,
      content,
      created_at,
      profiles:author_id (
        id,
        full_name,
        avatar_url
      )
    `
    )
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as Comment[];
}

export async function addComment(params: {
  postId: string;
  authorId: string;
  content: string;
}): Promise<void> {
  const { error } = await supabase.from('comments').insert({
    post_id: params.postId,
    author_id: params.authorId,
    content: params.content,
  });

  if (error) throw error;
}

// Listens for new comments on a post in real time. Postgres change events only carry the
// raw inserted row, not joined data, so we fetch the author's profile before handing the
// caller a Comment shaped the same way fetchComments() returns.
export function subscribeToComments(postId: string, onInsert: (comment: Comment) => void) {
  // Unique per subscriber, not just per post — see the comment in likes.ts's
  // subscribeToLikes for why a shared topic name breaks when the same post can
  // have more than one subscriber mounted at once (e.g. stacked screens).
  const channel = supabase
    .channel(`comments:${postId}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` },
      async (payload) => {
        const row = payload.new as {
          id: string;
          post_id: string;
          author_id: string;
          content: string;
          created_at: string;
        };

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .eq('id', row.author_id)
          .single();

        onInsert({
          id: row.id,
          post_id: row.post_id,
          content: row.content,
          created_at: row.created_at,
          profiles: profile ?? null,
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
