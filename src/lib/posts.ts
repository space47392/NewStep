import { supabase } from './supabase';
import { removePostPhotos } from './postPhotos';
import { Post, PostCategory, PostStatus } from '../types';

// Exported so other features that browse posts a different way (e.g. schools.ts's
// per-school sections) get the exact same shape as the feed, instead of a
// second, slightly-different select drifting out of sync with it.
export const POST_SELECT = `
  id,
  author_id,
  content,
  category,
  status,
  like_count,
  photo_urls,
  created_at,
  source_story_id,
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

// Powers FeedScreen's "Following" mode — same POST_SELECT shape as every
// other post query, just filtered to a caller-supplied set of author ids
// (from follows.ts's fetchFollowingIds()) instead of everyone or one school.
// Paginated the same way NotificationsScreen already is.
export async function fetchFollowingFeed(followingIds: string[], limit = 20, offset = 0): Promise<Post[]> {
  if (followingIds.length === 0) return [];

  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .in('author_id', followingIds)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

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

// Hydrates full Post objects (with the same joins every other post query
// uses) from a list of ids — used by search.ts's searchPosts() to turn
// search_posts()'s ranked (id, rank) pairs into real, renderable posts.
// `.in()` doesn't preserve the input order, so this restores it afterward.
export async function fetchPostsByIds(ids: string[]): Promise<Post[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabase.from('posts').select(POST_SELECT).in('id', ids);
  if (error) throw error;

  const posts = (data ?? []) as unknown as Post[];
  const order = new Map(ids.map((id, index) => [id, index]));
  return posts.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

// `!inner` on the author join turns .eq('profiles.school_name', ...) into a real
// filter on which POSTS come back (not just on the nested profile object) — the
// PostgREST convention for filtering by an embedded relation's column. Built from
// POST_SELECT rather than a second hand-written field list, so this can't quietly
// drift out of sync with what the feed already selects.
const POST_SELECT_BY_SCHOOL = POST_SELECT.replace('profiles:author_id (', 'profiles:author_id!inner (');

// Powers each section of the School Community page (Recent Posts / Recent Help /
// School Questions / Looking for Friends) — same query shape, just an optional
// category filter and a small limit, since a school page should never need to
// pull more than a handful of posts per section.
export async function fetchPostsBySchool(
  schoolName: string,
  category?: PostCategory,
  limit = 5,
  // Community Hub's "Need Help" section wants only actionable (open) requests,
  // not ones already accepted/completed — same optional-filter shape as
  // category above, not a separate query.
  status?: PostStatus
): Promise<Post[]> {
  let query = supabase
    .from('posts')
    .select(POST_SELECT_BY_SCHOOL)
    .eq('profiles.school_name', schoolName)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (category) {
    query = query.eq('category', category);
  }
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Post[];
}

// school_id-based twin of fetchPostsBySchool (Step 15's school directory) —
// reuses the exact same !inner-join select, just filtered on the stable
// school_id instead of the free-text school_name.
export async function fetchPostsBySchoolId(
  schoolId: string,
  category?: PostCategory,
  limit = 5,
  status?: PostStatus
): Promise<Post[]> {
  let query = supabase
    .from('posts')
    .select(POST_SELECT_BY_SCHOOL)
    .eq('profiles.school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (category) {
    query = query.eq('category', category);
  }
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Post[];
}

export async function createPost(params: {
  postId: string;
  authorId: string;
  content: string;
  category: PostCategory;
  photoUrls: string[];
  // Set only when this post was created via a School Story's "I Can Help"
  // action — see posts_story_origin.sql. No special privilege check needed
  // here: the author already fully controls every other field on their own
  // new post, so this is just another column, not a new access path.
  sourceStoryId?: string;
}): Promise<void> {
  const { error } = await supabase.from('posts').insert({
    id: params.postId,
    author_id: params.authorId,
    content: params.content,
    category: params.category,
    photo_urls: params.photoUrls,
    source_story_id: params.sourceStoryId ?? null,
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
