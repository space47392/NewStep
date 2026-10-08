import { File } from 'expo-file-system';
import { supabase } from './supabase';
import { colors } from '../constants/theme';

// School Sky (supabase/school_sky.sql): one mood star per student, visible
// to classmates for 24 hours after it was last set.

export type SkyMood = 'happy' | 'excited' | 'chill' | 'nervous' | 'tired' | 'down';

export const SKY_MOODS: { key: SkyMood; emoji: string; label: string; color: string }[] = [
  { key: 'happy', emoji: '😊', label: 'Good', color: colors.sticker.yellow },
  { key: 'excited', emoji: '🤩', label: 'Excited', color: colors.sticker.pink },
  { key: 'chill', emoji: '😌', label: 'Chill', color: colors.sticker.mint },
  { key: 'nervous', emoji: '😬', label: 'Nervous', color: colors.sticker.lilac },
  { key: 'tired', emoji: '😴', label: 'Tired', color: colors.sticker.blue },
  { key: 'down', emoji: '🥺', label: 'Down', color: '#C9C6E0' },
];

export function skyMood(key: string) {
  return SKY_MOODS.find((m) => m.key === key) ?? SKY_MOODS[0];
}

export const SKY_NOTE_MAX = 80;
const STAR_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type SkyStar = {
  user_id: string;
  mood: SkyMood;
  note: string | null;
  // A real-sky photo taken with the camera (school_sky_photos.sql).
  photo_url: string | null;
  updated_at: string;
  profile: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } | null;
};

// RLS already limits rows to the viewer's own school; this only drops
// stars older than a day.
export async function fetchSchoolSky(limit = 60): Promise<SkyStar[]> {
  const since = new Date(Date.now() - STAR_LIFETIME_MS).toISOString();
  const { data, error } = await supabase
    .from('sky_stars')
    .select('user_id, mood, note, photo_url, updated_at, profile:profiles!sky_stars_user_id_fkey ( id, full_name, username, avatar_url )')
    .gt('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as SkyStar[];
}

export async function setMyStar(mood: SkyMood, note: string, photoUrl: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_my_star', {
    p_mood: mood,
    p_note: note.trim() || null,
    p_photo_url: photoUrl,
  });
  if (error) throw error;
}

// One sky photo per student at a fixed path, overwritten each time — same
// pattern as stories, so account deletion can remove it by path.
export function skyPhotoPath(userId: string): string {
  return `${userId}/sky.jpg`;
}

export async function uploadSkyPhoto(userId: string, localUri: string): Promise<string> {
  const bytes = await new File(localUri).bytes();
  const { error } = await supabase.storage
    .from('sky')
    .upload(skyPhotoPath(userId), bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('sky').getPublicUrl(skyPhotoPath(userId));
  // Same URL every time, so bust the image cache after a retake.
  return `${data.publicUrl}?v=${Date.now()}`;
}

// Best-effort: a leftover file is overwritten by the next photo anyway.
export async function removeSkyPhoto(userId: string): Promise<void> {
  await supabase.storage.from('sky').remove([skyPhotoPath(userId)]);
}

export async function removeMyStar(userId: string): Promise<void> {
  const { error } = await supabase.from('sky_stars').delete().eq('user_id', userId);
  if (error) throw error;
  await removeSkyPhoto(userId).catch(() => {});
}

// A stable spot in the sky for each student, so their star doesn't jump
// around between visits. Returns fractions (0–1) of the sky's width/height.
export function starPosition(userId: string, index: number): { x: number; y: number } {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = (h >>> 0) / 4294967295;
  const b = ((Math.imul(h, 2654435761) >>> 0) % 10000) / 10000;
  // Spread rows so crowded skies don't stack everything in one band.
  const row = index % 5;
  // Kept above the horizon silhouette (bottom of the sky).
  return { x: 0.1 + a * 0.8, y: 0.1 + row * 0.12 + b * 0.09 };
}
