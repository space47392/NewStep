import { supabase } from './supabase';
import { Post, PostCategory } from '../types';

const POST_SELECT = `
  id,
  author_id,
  content,
  category,
  status,
  created_at,
  profiles:author_id (
    full_name,
    school_name,
    avatar_url
  ),
  helper:helper_id (
    full_name,
    school_name,
    avatar_url
  )
`;

export async function fetchPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as Post[];
}

export async function createPost(params: {
  authorId: string;
  content: string;
  category: PostCategory;
}): Promise<void> {
  const { error } = await supabase.from('posts').insert({
    author_id: params.authorId,
    content: params.content,
    category: params.category,
  });

  if (error) throw error;
}

export async function volunteerToHelp(params: { postId: string; helperId: string }): Promise<Post> {
  const { data, error } = await supabase
    .from('posts')
    .update({ helper_id: params.helperId, status: 'accepted' })
    .eq('id', params.postId)
    .select(POST_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as Post;
}
