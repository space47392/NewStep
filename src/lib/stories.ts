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
