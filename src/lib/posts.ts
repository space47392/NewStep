import { supabase } from './supabase';
import { removePostPhotos } from './postPhotos';
import { Post, PostCategory } from '../types';

const POST_SELECT = `
  id,
  author_id,
  content,
  category,
  status,
  like_count,
  photo_urls,
  created_at,
  comments:comments(count),
  profiles:author_id (
    id,
    full_name,
    school_name,
    avatar_url
  ),
  helper:helper_id (
    id,
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

export async function fetchPostById(postId: string): Promise<Post> {
  const { data, error } = await supabase.from('posts').select(POST_SELECT).eq('id', postId).single();

  if (error) throw error;
  return data as unknown as Post;
}

export async function fetchPostsByAuthor(authorId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('author_id', authorId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as Post[];
}

export async function createPost(params: {
  postId: string;
  authorId: string;
  content: string;
  category: PostCategory;
  photoUrls: string[];
}): Promise<void> {
  const { error } = await supabase.from('posts').insert({
    id: params.postId,
    author_id: params.authorId,
    content: params.content,
    category: params.category,
    photo_urls: params.photoUrls,
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

// Marking a request completed triggers a Postgres function that awards the helper 1 point.
export async function markPostCompleted(postId: string): Promise<Post> {
  const { data, error } = await supabase
    .from('posts')
    .update({ status: 'completed' })
    .eq('id', postId)
    .select(POST_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as Post;
}

// Goes through the edit_post() RPC rather than a plain client-side update — see
// posts_edit_delete.sql for why a general RLS policy isn't safe to add here.
export async function editPost(params: {
  postId: string;
  content: string;
  category: PostCategory;
  photoUrls: string[];
  removedPhotoUrls: string[];
}): Promise<void> {
  const { error } = await supabase.rpc('edit_post', {
    p_post_id: params.postId,
    p_content: params.content,
    p_category: params.category,
    p_photo_urls: params.photoUrls,
  });

  if (error) throw error;

  if (params.removedPhotoUrls.length > 0) {
    await removePostPhotos(params.removedPhotoUrls);
  }
}

export async function deletePost(postId: string, photoUrls: string[] = []): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;

  if (photoUrls.length > 0) {
    await removePostPhotos(photoUrls);
  }
}
