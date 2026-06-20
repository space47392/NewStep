import { supabase } from './supabase';
import { Post } from '../types';

export async function fetchPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(
      `
      id,
      content,
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
