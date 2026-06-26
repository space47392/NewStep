import { supabase } from './supabase';
import { Post, PostCategory } from '../types';

export async function fetchPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(
      `
      id,
      content,
      category,
      created_at,
      profiles:author_id (
        full_name,
        school_name,
        avatar_url
      )
    `
    )
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
