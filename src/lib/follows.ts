import { supabase } from './supabase';
import { PersonSearchResult } from '../types';

// Same narrow field list as people search/school member discovery — avatar,
// username, full name, school, grade, interests. Never points/role/anything
// else, even though follows themselves are public.
//
// school_id + the embedded school:school_id(name) relation (Step 49, P1 #1) —
// same pattern POST_SELECT/PERSON_SEARCH_FIELDS already use. Without this, a
// directory-based person (school_id set, school_name left NULL by
// setMySchool() — see schools.ts) showed no school at all in Followers/
// Following rows even though Search/Feed already resolved it correctly.
// Always resolve display names via resolveSchoolName() (lib/schools.ts), not
// school_name directly.
const FOLLOW_PERSON_FIELDS =
  'id, username, full_name, avatar_url, school_name, school_id, school:school_id ( name ), grade, interests';

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
//
// viewerBlockedIds (Step 49, P1 #3) — the CURRENT viewer's own blocked-user
// ids (not the profile owner's), same set FollowListScreen already fetches
// via fetchBlockedUserIds() and filters its rows with. Optional and additive:
// every existing caller (ProfileScreen/UserProfileScreen before this step)
// keeps compiling and behaving exactly as before by simply omitting it. When
// omitted or empty, this is the exact same two-query raw COUNT as before —
// no extra query is ever issued for the common case of a viewer with no
// blocks. Only when the viewer actually has blocks does this run two more
// small, indexed head-count queries (scoped to that already-small blocked
// list) to find out how many of THIS profile's followers/following are
// people the viewer has blocked, then subtracts them — the same "viewer's
// blocks hide this row" rule FollowListScreen already applies to its list,
// now applied to the number above it too, so the two never disagree.
export async function fetchFollowCounts(
  userId: string,
  viewerBlockedIds?: Set<string> | string[]
): Promise<{ followers: number; following: number }> {
  const [followersRes, followingRes] = await Promise.all([
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  if (followersRes.error) throw followersRes.error;
  if (followingRes.error) throw followingRes.error;

  let followers = followersRes.count ?? 0;
  let following = followingRes.count ?? 0;

  const blockedArray = viewerBlockedIds ? Array.from(viewerBlockedIds) : [];
  if (blockedArray.length > 0) {
    const [blockedFollowersRes, blockedFollowingRes] = await Promise.all([
      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', userId)
        .in('follower_id', blockedArray),
      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', userId)
        .in('following_id', blockedArray),
    ]);
    if (blockedFollowersRes.error) throw blockedFollowersRes.error;
    if (blockedFollowingRes.error) throw blockedFollowingRes.error;
    followers -= blockedFollowersRes.count ?? 0;
    following -= blockedFollowingRes.count ?? 0;
  }

  return { followers: Math.max(0, followers), following: Math.max(0, following) };
}

// Just the ids — used by fetchFollowingFeed() (posts.ts) to build its
// `.in('author_id', ids)` filter. Capped, not "every account this user
// follows," for the pathological-follow-count case.
export async function fetchFollowingIds(userId: string, limit = 500): Promise<string[]> {
  const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', userId).limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => row.following_id as string);
}

// One page of a followers/following list. `nextCursor` is the raw (pre any
// client-side blocked-user filtering) follows.created_at of the last row in
// this page, or null once nothing more came back — the caller should treat a
// null/undefined cursor after a full page as "no more," same as
// data.length === limit already meant before this step.
export type FollowPage = { people: PersonSearchResult[]; nextCursor: string | null };

// Two separate FKs from follows to profiles (follower_id, following_id) —
// same alias:column(...) disambiguation POST_SELECT already relies on for
// profiles:author_id / helper:helper_id.
//
// Cursor-based pagination (Step 49, P1 #5) — same reasoning as posts.ts's
// fetchPosts()/fetchFollowingFeed() from Step 48: a numeric offset here would
// drift the exact same way whenever someone follows/unfollows between page
// loads (a live, frequently-changing table), duplicating or skipping rows on
// "Load more." `beforeCreatedAt` filters on follows.created_at — the actual
// ordering column — never on anything derived from the embedded profile.
export async function fetchFollowers(userId: string, limit = 30, beforeCreatedAt?: string): Promise<FollowPage> {
  let query = supabase
    .from('follows')
    .select(`created_at, follower:follower_id (${FOLLOW_PERSON_FIELDS})`)
    .eq('following_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (beforeCreatedAt) {
    query = query.lt('created_at', beforeCreatedAt);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as { created_at: string; follower: PersonSearchResult }[];
  return {
    people: rows.map((row) => row.follower),
    nextCursor: rows.length > 0 ? rows[rows.length - 1].created_at : null,
  };
}

export async function fetchFollowing(userId: string, limit = 30, beforeCreatedAt?: string): Promise<FollowPage> {
  let query = supabase
    .from('follows')
    .select(`created_at, following:following_id (${FOLLOW_PERSON_FIELDS})`)
    .eq('follower_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (beforeCreatedAt) {
    query = query.lt('created_at', beforeCreatedAt);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as { created_at: string; following: PersonSearchResult }[];
  return {
    people: rows.map((row) => row.following),
    nextCursor: rows.length > 0 ? rows[rows.length - 1].created_at : null,
  };
}
