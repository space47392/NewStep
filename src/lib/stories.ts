import { File } from 'expo-file-system';
import { supabase } from './supabase';
import { Story } from '../types';

const STORY_SELECT = `
  id,
  author_id,
  image_url,
  created_at,
  expires_at,
  profiles:author_id (
    id,
    full_name,
    avatar_url
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

  // Atomically replaces any existing story — see replace_story() in stories_schema.sql.
  const { error: rpcError } = await supabase.rpc('replace_story', { p_image_url: data.publicUrl });
  if (rpcError) throw rpcError;
}

export async function deleteStory(storyId: string): Promise<void> {
  const { error } = await supabase.from('stories').delete().eq('id', storyId);
  if (error) throw error;
}
