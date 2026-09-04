import { File } from 'expo-file-system';
import { supabase } from './supabase';
import { Story, ChatProfile } from '../types';

const STORY_SELECT = `
  id,
  author_id,
  image_url,
  created_at,
  expires_at,
  profiles:author_id (
    id,
    full_name,
    avatar_url,
    school_name
  )
`;

export async function fetchActiveStories(): Promise<Story[]> {
  const { data, error } = await supabase
    .from('stories')
    .select(STORY_SELECT)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as Story[];
}

// `!inner` on the author join turns .eq('profiles.school_name', ...) into a real
// filter on which STORIES come back — the same PostgREST convention posts.ts's
// fetchPostsBySchool already relies on, built from STORY_SELECT so it can't
// quietly drift out of sync with what fetchActiveStories() already selects.
const STORY_SELECT_BY_SCHOOL = STORY_SELECT.replace('profiles:author_id (', 'profiles:author_id!inner (');

// Powers SchoolScreen's "Stories" row and SearchScreen's School Stories
// discovery prompt — same active-only filter as fetchActiveStories(), just
// narrowed to one school. No new index needed: profiles.school_name is
// already indexed (schools_performance_index.sql) and stories is inherently
// small given the 24-hour expiry.
export async function fetchStoriesBySchool(schoolName: string, limit = 20): Promise<Story[]> {
  const { data, error } = await supabase
    .from('stories')
    .select(STORY_SELECT_BY_SCHOOL)
    .eq('profiles.school_name', schoolName)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as Story[];
}

// school_id-based twin of fetchStoriesBySchool (Step 15's school directory) —
// same select and active-only filter, just against the stable school_id.
export async function fetchStoriesBySchoolId(schoolId: string, limit = 20): Promise<Story[]> {
  const { data, error } = await supabase
    .from('stories')
    .select(STORY_SELECT_BY_SCHOOL)
    .eq('profiles.school_id', schoolId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as Story[];
}

export async function uploadStory(params: {
  userId: string;
  localUri: string;
  mimeType?: string;
}): Promise<void> {
  const path = `${params.userId}/story.jpg`;
  const file = new File(params.localUri);
  const bytes = await file.bytes();

  const { error: uploadError } = await supabase.storage
    .from('stories')
    .upload(path, bytes, { contentType: params.mimeType ?? 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('stories').getPublicUrl(path);
  // The upload path is fixed per user (upsert overwrite), so the public URL is
  // identical every time — without a cache-busting param, <Image> would keep
  // showing the previous story's cached bytes after a replace.
  const cacheBustedUrl = `${data.publicUrl}?v=${Date.now()}`;

  // Atomically replaces any existing story — see replace_story() in stories_schema.sql.
  const { error: rpcError } = await supabase.rpc('replace_story', { p_image_url: cacheBustedUrl });
  if (rpcError) throw rpcError;
}

export async function deleteStory(storyId: string): Promise<void> {
  const { error } = await supabase.from('stories').delete().eq('id', storyId);
  if (error) throw error;
}

// Best-effort — a story owner viewing their own story, or a duplicate view
// from re-opening the same story, are both harmless no-ops (see story_views'
// unique constraint and this table's INSERT policy).
export async function recordStoryView(params: { storyId: string; viewerId: string }): Promise<void> {
  const { error } = await supabase
    .from('story_views')
    .insert({ story_id: params.storyId, viewer_id: params.viewerId });
  // 23505 = unique_violation — already recorded, treat as a no-op success.
  if (error && error.code !== '23505') throw error;
}

type StoryViewerRow = { profiles: ChatProfile | null };

// RLS scopes this to the story's own author automatically — see
// story_views_schema.sql — so there's no need to check ownership client-side.
export async function fetchStoryViewers(storyId: string): Promise<ChatProfile[]> {
  const { data, error } = await supabase
    .from('story_views')
    .select('profiles:viewer_id (id, full_name, avatar_url)')
    .eq('story_id', storyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as unknown as StoryViewerRow[];
  return rows.map((row) => row.profiles).filter((p): p is ChatProfile => p !== null);
}

// Goes through the send_story_wave() RPC rather than inserting a notification
// directly — create_notification() is guard-flag protected and was never
// meant to be reachable from the client (see story_wave_schema.sql). No
// conversation is created here — this is the entire action.
export async function sayHiToStory(storyId: string): Promise<void> {
  const { error } = await supabase.rpc('send_story_wave', { p_story_id: storyId });
  if (error) throw error;
}
