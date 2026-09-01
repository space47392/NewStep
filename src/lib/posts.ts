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

// Goes through the volunteer_to_help() RPC rather than a plain client-side update —
// see secure_help_lifecycle.sql. A general RLS policy isn't safe here: combined with
// the completion policy it used to allow, Postgres ORs multiple permissive policies'
// USING/WITH CHECK together, which let a non-author jump an open post straight to
// 'completed'. The RPC re-validates everything server-side under a row lock and
// never trusts a client-supplied helper id — it reads it from auth.uid() itself.
export async function volunteerToHelp(postId: string): Promise<Post> {
  const { error } = await supabase.rpc('volunteer_to_help', { p_post_id: postId });
  if (error) throw error;
  return fetchPostById(postId);
}

// Goes through the mark_post_completed() RPC — see secure_help_lifecycle.sql. The
// helper's point award still happens via the existing handle_post_completed()
// trigger, unchanged, once this RPC transitions the row to 'completed'.
export async function markPostCompleted(postId: string): Promise<Post> {
  const { error } = await supabase.rpc('mark_post_completed', { p_post_id: postId });
  if (error) throw error;
  return fetchPostById(postId);
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
