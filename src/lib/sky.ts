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
  updated_at: string;
  profile: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } | null;
};

// RLS already limits rows to the viewer's own school; this only drops
// stars older than a day.
export async function fetchSchoolSky(limit = 60): Promise<SkyStar[]> {
  const since = new Date(Date.now() - STAR_LIFETIME_MS).toISOString();
  const { data, error } = await supabase
    .from('sky_stars')
    .select('user_id, mood, note, updated_at, profile:profiles!sky_stars_user_id_fkey ( id, full_name, username, avatar_url )')
    .gt('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as SkyStar[];
}

export async function setMyStar(mood: SkyMood, note: string): Promise<void> {
  const { error } = await supabase.rpc('set_my_star', { p_mood: mood, p_note: note.trim() || null });
  if (error) throw error;
}

export async function removeMyStar(userId: string): Promise<void> {
  const { error } = await supabase.from('sky_stars').delete().eq('user_id', userId);
  if (error) throw error;
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
  return { x: 0.08 + a * 0.84, y: 0.08 + (row * 0.18 + b * 0.14) };
}
