import { supabase } from './supabase';
import { PersonSearchResult } from '../types';

// Same narrow field list as people search/school member discovery — avatar,
// username, full name, school, grade, interests. Never points/role/anything
// else, even though follows themselves are public.
const FOLLOW_PERSON_FIELDS = 'id, username, full_name, avatar_url, school_name, grade, interests';

export async function followUser(params: { followerId: string; followingId: string }): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: params.followerId, following_id: params.followingId });
  // 23505 = unique_violation — already following; treat as a no-op success.
  if (error && error.code !== '23505') throw error;
}

export async function unfollowUser(params: { followerId: string; followingId: string }): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', params.followerId)
    .eq('following_id', params.followingId);
  if (error) throw error;
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

// head: true on both — counts only, never the rows, for the profile stat row.
export async function fetchFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [followersRes, followingRes] = await Promise.all([
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  if (followersRes.error) throw followersRes.error;
  if (followingRes.error) throw followingRes.error;
  return { followers: followersRes.count ?? 0, following: followingRes.count ?? 0 };
}

// Just the ids — used by fetchFollowingFeed() (posts.ts) to build its
// `.in('author_id', ids)` filter. Capped, not "every account this user
// follows," for the pathological-follow-count case.
export async function fetchFollowingIds(userId: string, limit = 500): Promise<string[]> {
  const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', userId).limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => row.following_id as string);
}

// Two separate FKs from follows to profiles (follower_id, following_id) —
// same alias:column(...) disambiguation POST_SELECT already relies on for
// profiles:author_id / helper:helper_id.
export async function fetchFollowers(userId: string, limit = 30, offset = 0): Promise<PersonSearchResult[]> {
  const { data, error } = await supabase
    .from('follows')
    .select(`follower:follower_id (${FOLLOW_PERSON_FIELDS})`)
    .eq('following_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return ((data ?? []) as unknown as { follower: PersonSearchResult }[]).map((row) => row.follower);
}

export async function fetchFollowing(userId: string, limit = 30, offset = 0): Promise<PersonSearchResult[]> {
  const { data, error } = await supabase
    .from('follows')
    .select(`following:following_id (${FOLLOW_PERSON_FIELDS})`)
    .eq('follower_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return ((data ?? []) as unknown as { following: PersonSearchResult }[]).map((row) => row.following);
}
